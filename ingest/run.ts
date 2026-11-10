// Phase 3+: entry point that runs every enabled data source and writes a
// sync_runs row. `npm run ingest` runs this once; Phase 4 puts it on a
// GitHub Actions schedule.
//
// Processes each provider's facility_uses sources before its slots sources
// (slots reference facilities by id, so the facility has to exist first).
// 'facility_uses' and 'slots' sources are OpenActive-shaped by construction
// (see the comment on data_sources.kind in the schema) and dispatch purely
// on that kind, regardless of provider. A 'venue_list' source is a small,
// fixed set of venues read directly (no RPDE paging) — each one owns its
// own adapter, so it dispatches on provider_id instead.
import { existsSync } from "node:fs";
import {
  isWithinSyncWindow,
  parseFacilityUseItem,
  parseSlotItem,
  type FacilityUseData,
  type SlotData,
} from "./adapters/openactive.ts";
import { syncLtaProvider } from "./adapters/lta.ts";
import { syncProagendaProvider } from "./adapters/proagenda.ts";
import type { RpdeItem } from "./core/rpde.ts";
import { syncRpdeFeed } from "./core/rpde.ts";
import {
  deleteSlot,
  finishSyncRun,
  getEnabledDataSources,
  getKnownFacilities,
  recordSourceFailure,
  recordSourceSuccess,
  startSyncRun,
  upsertFacility,
  upsertSlot,
  upsertVenue,
  type DataSourceRow,
  type KnownFacility,
} from "./core/upsert.ts";

if (existsSync(".env.local")) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // already loaded, or the file is empty — fine either way
  }
}

async function runFacilityUsesSource(source: DataSourceRow): Promise<void> {
  const runId = await startSyncRun(source.id);
  let upserted = 0;
  let deletedUnsupported = 0;

  try {
    const result = await syncRpdeFeed<FacilityUseData>(
      source.next_url ?? source.url,
      async (items: RpdeItem<FacilityUseData>[], pageBookmark: string) => {
        for (const item of items) {
          const parsed = parseFacilityUseItem(item);
          if (!parsed) continue; // not tennis/padel, not in Greater London, or no coordinates
          if (parsed.kind === "delete_unsupported") {
            deletedUnsupported++;
            continue;
          }
          const venueId = await upsertVenue(source.provider_id, parsed.venue);
          for (const facility of parsed.facilities) {
            await upsertFacility(source.provider_id, venueId, facility);
            upserted++;
          }
        }
        await recordSourceSuccess(source.id, pageBookmark);
      }
    );
    await finishSyncRun(runId, "ok", upserted, 0);
    console.log(
      `  facility_uses: ${result.pagesRead} page(s), ${upserted} facilities upserted` +
        (deletedUnsupported ? `, ${deletedUnsupported} deletion(s) skipped (no data to match)` : "") +
        (result.caughtUp ? "" : " (feed has more pages than we read this run — resuming next time)")
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(runId, "failed", upserted, 0, message);
    await recordSourceFailure(source.id, source.consecutive_failures);
    console.error(`  facility_uses FAILED: ${message}`);
  }
}

async function runSlotsSource(source: DataSourceRow, knownFacilities: Map<string, KnownFacility>): Promise<void> {
  const runId = await startSyncRun(source.id);
  let upserted = 0;
  let deleted = 0;
  let skippedUnknownFacility = 0;
  let skippedOutsideWindow = 0;

  try {
    const result = await syncRpdeFeed<SlotData>(
      source.next_url ?? source.url,
      async (items: RpdeItem<SlotData>[], pageBookmark: string) => {
        for (const item of items) {
          const parsed = parseSlotItem(item);
          if (!parsed) continue;

          if (parsed.kind === "delete") {
            await deleteSlot(source.provider_id, parsed.external_id);
            deleted++;
            continue;
          }

          const facility = knownFacilities.get(parsed.slot.facility_external_id);
          if (!facility) {
            skippedUnknownFacility++; // not one of our tennis/padel facilities
            continue;
          }
          if (!isWithinSyncWindow(parsed.slot.start_at)) {
            skippedOutsideWindow++;
            continue;
          }
          await upsertSlot(source.provider_id, facility, parsed.slot);
          upserted++;
        }
        await recordSourceSuccess(source.id, pageBookmark);
      }
    );
    await finishSyncRun(runId, "ok", upserted, deleted);
    console.log(
      `  slots: ${result.pagesRead} page(s), ${upserted} upserted, ${deleted} deleted ` +
        `(${skippedUnknownFacility} for other activities, ${skippedOutsideWindow} outside the 8-day window)` +
        (result.caughtUp ? "" : " (feed has more pages than we read this run — resuming next time)")
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(runId, "failed", upserted, deleted, message);
    await recordSourceFailure(source.id, source.consecutive_failures);
    console.error(`  slots FAILED: ${message}`);
  }
}

const VENUE_LIST_SYNCERS: Record<string, () => Promise<{ upserted: number; deleted: number }>> = {
  lta: syncLtaProvider,
  proagenda: syncProagendaProvider,
};

async function runVenueListSource(source: DataSourceRow): Promise<void> {
  const runId = await startSyncRun(source.id);
  const syncProvider = VENUE_LIST_SYNCERS[source.provider_id];

  try {
    if (!syncProvider) throw new Error(`No venue_list adapter registered for provider "${source.provider_id}"`);
    const { upserted, deleted } = await syncProvider();
    await finishSyncRun(runId, "ok", upserted, deleted);
    await recordSourceSuccess(source.id, source.url);
    console.log(`  venue_list: ${upserted} slot(s) upserted, ${deleted} removed (booked or past)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishSyncRun(runId, "failed", 0, 0, message);
    await recordSourceFailure(source.id, source.consecutive_failures);
    console.error(`  venue_list FAILED: ${message}`);
  }
}

async function main() {
  const sources = await getEnabledDataSources();
  const byProvider = new Map<string, DataSourceRow[]>();
  for (const source of sources) {
    byProvider.set(source.provider_id, [...(byProvider.get(source.provider_id) ?? []), source]);
  }

  for (const [providerId, providerSources] of byProvider) {
    console.log(`\n${providerId}:`);

    const facilityUseSources = providerSources.filter((s) => s.kind === "facility_uses");
    const slotSources = providerSources.filter((s) => s.kind === "slots");
    const venueListSources = providerSources.filter((s) => s.kind === "venue_list");

    for (const source of facilityUseSources) {
      await runFacilityUsesSource(source);
    }

    if (slotSources.length > 0) {
      const knownFacilities = await getKnownFacilities(providerId);
      for (const source of slotSources) {
        await runSlotsSource(source, knownFacilities);
      }
    }

    for (const source of venueListSources) {
      await runVenueListSource(source);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
