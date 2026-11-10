// Phase 3: writes normalised venue/facility/slot rows to the database,
// upserting on external_id. Every function here is safe to call again with
// the same input — re-running any job is always safe (CLAUDE.md rule 3).
import { getIngestClient } from "./db.ts";
import type { ParsedFacility, ParsedSlot, ParsedVenue } from "./types.ts";

export interface DataSourceRow {
  id: string;
  provider_id: string;
  kind: string;
  url: string;
  next_url: string | null;
  consecutive_failures: number;
}

export async function getEnabledDataSources(): Promise<DataSourceRow[]> {
  const { data, error } = await getIngestClient()
    .from("data_sources")
    .select("id, provider_id, kind, url, next_url, consecutive_failures")
    .eq("enabled", true);
  if (error) throw error;
  return data;
}

export async function upsertVenue(providerId: string, venue: ParsedVenue): Promise<string> {
  const { data, error } = await getIngestClient()
    .from("venues")
    .upsert(
      {
        provider_id: providerId,
        external_id: venue.external_id,
        name: venue.name,
        address: venue.address,
        postcode: venue.postcode,
        borough: venue.borough,
        location: `SRID=4326;POINT(${venue.lng} ${venue.lat})`,
        booking_url: venue.booking_url,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id,external_id" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function upsertFacility(
  providerId: string,
  venueId: string,
  facility: ParsedFacility
): Promise<string> {
  const { data, error } = await getIngestClient()
    .from("facilities")
    .upsert(
      {
        venue_id: venueId,
        provider_id: providerId,
        external_id: facility.external_id,
        name: facility.name,
        sport: facility.sport,
        indoor: facility.indoor,
        floodlit: facility.floodlit,
        surface: facility.surface,
      },
      { onConflict: "provider_id,external_id" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export interface KnownFacility {
  id: string;
  venue_id: string;
}

// The facility set a provider's slots are checked against. Loaded fresh
// from the database (not just this run's facility-uses page) because an
// incremental RPDE page only lists what changed — most known facilities
// won't appear in it, but their slots still need accepting.
export async function getKnownFacilities(
  providerId: string
): Promise<Map<string, KnownFacility>> {
  const { data, error } = await getIngestClient()
    .from("facilities")
    .select("id, venue_id, external_id")
    .eq("provider_id", providerId);
  if (error) throw error;
  return new Map(data.map((f) => [f.external_id, { id: f.id, venue_id: f.venue_id }]));
}

export async function upsertSlot(
  providerId: string,
  facility: KnownFacility,
  slot: ParsedSlot
): Promise<void> {
  const { error } = await getIngestClient().from("slots").upsert(
    {
      facility_id: facility.id,
      venue_id: facility.venue_id,
      provider_id: providerId,
      external_id: slot.external_id,
      start_at: slot.start_at,
      end_at: slot.end_at,
      remaining: slot.remaining,
      capacity: slot.capacity,
      price_pence: slot.price_pence,
      source_modified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id,external_id" }
  );
  if (error) throw error;
}

export async function deleteSlot(providerId: string, externalId: string): Promise<void> {
  const { error } = await getIngestClient()
    .from("slots")
    .delete()
    .eq("provider_id", providerId)
    .eq("external_id", externalId);
  if (error) throw error;
}

// For a "venue_list" source (no RPDE delete events): each run re-fetches a
// facility's full set of upcoming slots, so any slot that's disappeared
// since the last run (booked by someone else, or past) needs removing
// explicitly before the fresh set is inserted. Safe to re-run (CLAUDE.md
// rule 3) — a run that fails partway just leaves that facility re-checked
// next time, same as any other source.
export async function deleteFutureSlotsForFacility(
  providerId: string,
  facilityId: string,
  fromIso: string
): Promise<number> {
  const { data, error } = await getIngestClient()
    .from("slots")
    .delete()
    .eq("provider_id", providerId)
    .eq("facility_id", facilityId)
    .gte("start_at", fromIso)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function startSyncRun(dataSourceId: string): Promise<string> {
  const { data, error } = await getIngestClient()
    .from("sync_runs")
    .insert({ data_source_id: dataSourceId, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishSyncRun(
  runId: string,
  status: "ok" | "failed",
  itemsUpserted: number,
  itemsDeleted: number,
  error?: string
): Promise<void> {
  const { error: updateError } = await getIngestClient()
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      items_upserted: itemsUpserted,
      items_deleted: itemsDeleted,
      error: error ?? null,
    })
    .eq("id", runId);
  if (updateError) throw updateError;
}

export async function recordSourceSuccess(dataSourceId: string, nextUrl: string): Promise<void> {
  const { error } = await getIngestClient()
    .from("data_sources")
    .update({
      next_url: nextUrl,
      last_success_at: new Date().toISOString(),
      consecutive_failures: 0,
    })
    .eq("id", dataSourceId);
  if (error) throw error;
}

export async function recordSourceFailure(
  dataSourceId: string,
  consecutiveFailures: number
): Promise<void> {
  const { error } = await getIngestClient()
    .from("data_sources")
    .update({ consecutive_failures: consecutiveFailures + 1 })
    .eq("id", dataSourceId);
  if (error) throw error;
}
