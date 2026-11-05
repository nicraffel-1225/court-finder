// Phase 2 integration tests. These hit a real Supabase project, so they need
// .env.local populated (see README.md). They skip cleanly — rather than
// failing `npm test` — when that's not set up yet.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (existsSync(".env.local")) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // already loaded, or the file is empty — fine either way
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(url && anonKey && serviceRoleKey);

// Approximate coordinates for N5 1AB (Highbury, Islington).
const N5_1AB = { lat: 51.5486, lng: -0.0972 };
// Wembley — roughly 13km from N5 1AB, well outside a 3km search.
const TEN_KM_AWAY = { lat: 51.556, lng: -0.2795 };

const TEST_PROVIDER_ID = "test_provider_phase2";

describe.skipIf(!hasCredentials)("search_slots (Phase 2)", () => {
  const admin = hasCredentials ? createClient(url!, serviceRoleKey!) : null;
  const anon = hasCredentials ? createClient(url!, anonKey!) : null;

  let venueId: string;

  beforeAll(async () => {
    await admin!.from("providers").upsert({
      id: TEST_PROVIDER_ID,
      name: "Test provider",
      access_method: "link_only",
      enabled: false,
    });

    const { data: dataSource, error: dsError } = await admin!
      .from("data_sources")
      .upsert(
        {
          provider_id: TEST_PROVIDER_ID,
          kind: "slots",
          url: "https://example.invalid/test-feed",
          last_success_at: new Date().toISOString(),
        },
        { onConflict: "provider_id,kind,url" }
      )
      .select()
      .single();
    if (dsError) throw dsError;

    const { data: venue, error: venueError } = await admin!
      .from("venues")
      .upsert(
        {
          provider_id: TEST_PROVIDER_ID,
          external_id: "test-venue-1",
          name: "Test Tennis Venue",
          location: `SRID=4326;POINT(${N5_1AB.lng} ${N5_1AB.lat})`,
          is_active: true,
        },
        { onConflict: "provider_id,external_id" }
      )
      .select()
      .single();
    if (venueError) throw venueError;
    venueId = venue.id;

    const { data: facility, error: facilityError } = await admin!
      .from("facilities")
      .upsert(
        {
          venue_id: venueId,
          provider_id: TEST_PROVIDER_ID,
          external_id: "test-facility-1",
          name: "Test Court 1",
          sport: "tennis",
        },
        { onConflict: "provider_id,external_id" }
      )
      .select()
      .single();
    if (facilityError) throw facilityError;

    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const { error: slotError } = await admin!.from("slots").upsert(
      {
        facility_id: facility.id,
        venue_id: venueId,
        provider_id: TEST_PROVIDER_ID,
        external_id: "test-slot-1",
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        remaining: 1,
        price_pence: 500,
      },
      { onConflict: "provider_id,external_id" }
    );
    if (slotError) throw slotError;

    void dataSource;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("venues").delete().eq("provider_id", TEST_PROVIDER_ID);
    await admin.from("data_sources").delete().eq("provider_id", TEST_PROVIDER_ID);
    await admin.from("providers").delete().eq("id", TEST_PROVIDER_ID);
  });

  it("finds the test venue within 3km of N5 1AB", async () => {
    const { data, error } = await anon!.rpc("search_slots", {
      lat: N5_1AB.lat,
      lng: N5_1AB.lng,
      radius_m: 3000,
      sport_filter: "tennis",
    });
    expect(error).toBeNull();
    expect(data?.some((row: { venue_id: string }) => row.venue_id === venueId)).toBe(true);
  });

  it("does not find the test venue from ~13km away", async () => {
    const { data, error } = await anon!.rpc("search_slots", {
      lat: TEN_KM_AWAY.lat,
      lng: TEN_KM_AWAY.lng,
      radius_m: 3000,
      sport_filter: "tennis",
    });
    expect(error).toBeNull();
    expect(data?.some((row: { venue_id: string }) => row.venue_id === venueId)).toBe(false);
  });

  it("refuses an insert with the anon key", async () => {
    const { error } = await anon!.from("venues").insert({
      provider_id: TEST_PROVIDER_ID,
      external_id: "should-not-be-allowed",
      name: "Should not be insertable",
      location: `SRID=4326;POINT(${N5_1AB.lng} ${N5_1AB.lat})`,
    });
    expect(error).not.toBeNull();

    const { data } = await admin!
      .from("venues")
      .select("id")
      .eq("provider_id", TEST_PROVIDER_ID)
      .eq("external_id", "should-not-be-allowed");
    expect(data).toHaveLength(0);
  });
});

if (!hasCredentials) {
  describe("search_slots (Phase 2)", () => {
    it.skip("needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local", () => {});
  });
}
