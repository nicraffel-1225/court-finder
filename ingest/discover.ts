// Phase 1: one-off research script. Walks the OpenActive data catalogue
// collection (catalogues -> dataset sites -> feeds), looks for feeds related
// to the providers in docs/BUILD_GUIDE.md plus any London tennis/padel
// facility data, and writes what it finds into docs/data-sources.md.
//
// Read-only: makes no database writes, fetches at most one request per
// second, and reads only the first page of each candidate feed.

import { writeFileSync } from "node:fs";

const CATALOGUE_COLLECTION_URL =
  "https://openactive.io/data-catalogs/data-catalog-collection.jsonld";

// Identifies this script to the sites it reads, without putting a personal
// email in a public User-Agent header. Swap the URL for your own contact
// if you'd rather providers see that instead.
const USER_AGENT =
  "LondonCourtFinder/0.1 (+https://github.com/nicraffel-1225/court-finder)";

// Named providers from docs/BUILD_GUIDE.md's provider table, matched against
// a dataset site's URL or publisher name.
// Deliberately specific: e.g. "parksports" (not "park sports") so we don't
// accidentally match unrelated venues like "Debdale Park Sports Club" in
// Manchester, which has nothing to do with our Park Sports (Royal Parks).
const NAMED_PATTERNS: Record<string, RegExp> = {
  "ClubSpark (LTA)": /clubspark|lawntennis|\blta\b/i,
  "Better (GLL)": /\bgll\b|better/i,
  "Courtside (Tower Hamlets)": /courtside|towerhamlet/i,
  "Park Sports (Royal Parks)": /parksports\.co\.uk|royalparks/i,
  "Camden Active": /camden/i,
  "All Star / Enable (Wandsworth)": /allstar|\benable\b|wandsworth/i,
  "Playtomic": /playtomic/i,
  "Everyone Active": /everyone\s*active/i,
};

// Playfinder/Bookteq hosts hundreds of unrelated clubs nationwide (schools,
// cricket clubs, etc.), so on its own "bookteq" isn't a useful filter. We
// only treat a Bookteq-hosted site as a candidate when its hostname also
// names a London borough (handled by matchesLondonBorough below).

// Every London borough (+ the City of London), lower-cased with spaces
// removed, for a cheap substring match against a dataset site's hostname.
// This is how we catch "any feed containing tennis or padel facility slots
// in London" beyond the explicitly named providers, without having to fetch
// all ~170 dataset sites just to read their publisher name.
const LONDON_BOROUGHS = [
  "cityoflondon", "barkinganddagenham", "barnet", "bexley", "brent", "bromley",
  "camden", "croydon", "ealing", "enfield", "greenwich", "hackney",
  "hammersmithandfulham", "haringey", "harrow", "havering", "hillingdon",
  "hounslow", "islington", "kensingtonandchelsea", "kingstonuponthames",
  "lambeth", "lewisham", "merton", "newham", "redbridge",
  "richmonduponthames", "southwark", "sutton", "towerhamlets",
  "walthamforest", "wandsworth", "westminster",
];

// Deliberately NOT using outward postcode areas (BR/CR/DA/EN/HA/... all
// straddle the Greater London boundary and also cover plenty of non-London
// towns, e.g. DA12 is Gravesend, Kent) — that produced a false positive on
// the first run. We only trust an address that explicitly says so.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape of external JSON-LD/RPDE responses isn't ours to type
type JsonValue = Record<string, any>;

let lastRequestAt = 0;
async function politeFetchText(url: string): Promise<string> {
  const waitMs = 1000 - (Date.now() - lastRequestAt);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  lastRequestAt = Date.now();
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "application/vnd.openactive.rpde+json; version=1, application/json, text/html",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function politeFetchJson(url: string): Promise<JsonValue> {
  const text = await politeFetchText(url);
  return JSON.parse(text);
}

// An OpenActive "dataset site" is sometimes served as raw JSON-LD, and
// sometimes as an HTML page with the same JSON-LD embedded in a <script>
// tag (this is the more common case in practice).
function extractJsonLd(text: string): JsonValue | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
    );
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function matchedNamedProvider(url: string, publisherName?: string): string | null {
  const haystack = `${url} ${publisherName ?? ""}`;
  for (const [provider, pattern] of Object.entries(NAMED_PATTERNS)) {
    if (pattern.test(haystack)) return provider;
  }
  return null;
}

function matchesLondonBorough(url: string): boolean {
  const host = hostnameOf(url).replace(/[^a-z]/g, "");
  return LONDON_BOROUGHS.some((b) => host.includes(b));
}

function isRealTennisOrPadel(name: string): boolean {
  return /tennis|padel/i.test(name) && !/table\s*tennis/i.test(name);
}

function isLondonAddress(address: JsonValue | undefined): boolean {
  if (!address) return false;
  const region = String(address.addressRegion ?? "");
  const locality = String(address.addressLocality ?? "");
  return /london/i.test(region) || /london/i.test(locality);
}

interface CandidateSite {
  url: string;
  reason: string; // why we picked this one: named provider match, or borough match
}

interface FeedFinding {
  provider: string;
  siteUrl: string;
  publisher: string;
  licence: string;
  feedUrl: string | null;
  itemType: string | null;
  hasTennisOrPadel: boolean;
  hasLondonTennisOrPadel: boolean;
  sampleItemName: string | null;
  sampleVenueName: string | null;
  sampleAddress: string | null;
  note?: string;
}

async function main() {
  console.log("Fetching the OpenActive data catalogue collection...");
  const collection = await politeFetchJson(CATALOGUE_COLLECTION_URL);
  const catalogueUrls: string[] = collection.hasPart ?? [];
  console.log(`Found ${catalogueUrls.length} top-level catalogues.`);

  const datasetSiteUrls = new Set<string>();
  for (const catalogueUrl of catalogueUrls) {
    try {
      const catalogue = await politeFetchJson(catalogueUrl);
      for (const d of catalogue.dataset ?? catalogue.hasPart ?? []) {
        datasetSiteUrls.add(d);
      }
    } catch (err) {
      console.warn(`  Could not read catalogue ${catalogueUrl}: ${err}`);
    }
  }
  console.log(`Found ${datasetSiteUrls.size} dataset sites across all catalogues.`);

  // Narrow down to candidates by URL alone (no extra requests), since
  // fetching all ~170 dataset sites just to read their name would blow the
  // politeness budget for a one-off research pass.
  // Skip obvious dev/staging mirrors (e.g. dev.myeveryoneactive.com) — we
  // want production data, not whatever's sitting in a test environment.
  const isDevOrStaging = (url: string) => /^(dev|staging|test|uat)[.-]/i.test(hostnameOf(url));

  const candidates: CandidateSite[] = [];
  for (const url of datasetSiteUrls) {
    if (isDevOrStaging(url)) continue;
    const named = matchedNamedProvider(url);
    if (named) {
      candidates.push({ url, reason: `named provider: ${named}` });
    } else if (matchesLondonBorough(url)) {
      candidates.push({ url, reason: "London borough in hostname" });
    }
  }
  console.log(`Narrowed to ${candidates.length} candidate dataset sites.`);

  const findings: FeedFinding[] = [];

  for (const { url, reason } of candidates) {
    let site: JsonValue;
    try {
      const text = await politeFetchText(url);
      const ld = extractJsonLd(text);
      if (!ld) {
        findings.push({
          provider: reason,
          siteUrl: url,
          publisher: "?",
          licence: "?",
          feedUrl: null,
          itemType: null,
          hasTennisOrPadel: false,
          hasLondonTennisOrPadel: false,
          sampleItemName: null,
          sampleVenueName: null,
          sampleAddress: null,
          note: "could not find embedded JSON-LD on this dataset site",
        });
        continue;
      }
      site = ld;
    } catch (err) {
      findings.push({
        provider: reason,
        siteUrl: url,
        publisher: "?",
        licence: "?",
        feedUrl: null,
        itemType: null,
        hasTennisOrPadel: false,
        hasLondonTennisOrPadel: false,
        sampleItemName: null,
        sampleVenueName: null,
        sampleAddress: null,
        note: `fetch failed: ${err}`,
      });
      continue;
    }

    const publisher =
      (typeof site.publisher === "string" ? site.publisher : site.publisher?.name) || "?";
    const licence = site.license ?? "?";
    const provider = matchedNamedProvider(url, publisher) ?? reason;

    const distribution: JsonValue[] = site.distribution ?? [];
    const facilityFeed = distribution.find(
      (d) => d.name === "FacilityUse" || /facilityuse/i.test(d.name ?? "")
    );
    const feedUrl: string | null = facilityFeed?.contentUrl ?? null;

    if (!feedUrl) {
      findings.push({
        provider,
        siteUrl: url,
        publisher,
        licence,
        feedUrl: null,
        itemType: distribution.map((d) => d.name).join(", ") || null,
        hasTennisOrPadel: false,
        hasLondonTennisOrPadel: false,
        sampleItemName: null,
        sampleVenueName: null,
        sampleAddress: null,
        note: "no FacilityUse feed in this dataset site's distribution",
      });
      continue;
    }

    try {
      const page = await politeFetchJson(feedUrl);
      const items: JsonValue[] = page.items ?? [];

      let best: JsonValue | null = null;
      let hasTennisOrPadel = false;
      let hasLondonTennisOrPadel = false;

      for (const item of items) {
        const d = item.data ?? {};
        const name = String(d.name ?? "");
        if (!isRealTennisOrPadel(name)) continue;
        hasTennisOrPadel = true;
        const address = d.location?.address;
        const london = isLondonAddress(address);
        if (london) hasLondonTennisOrPadel = true;
        if (!best || (london && !isLondonAddress(best.data?.location?.address))) {
          best = item;
        }
      }
      const sample = best ?? items[0] ?? null;
      const sampleData = sample?.data ?? {};
      const sampleAddress = sampleData.location?.address;

      findings.push({
        provider,
        siteUrl: url,
        publisher,
        licence,
        feedUrl,
        itemType: "FacilityUse",
        hasTennisOrPadel,
        hasLondonTennisOrPadel,
        sampleItemName: sampleData.name ?? null,
        sampleVenueName: sampleData.location?.name ?? null,
        sampleAddress: sampleAddress
          ? [sampleAddress.addressLocality, sampleAddress.postalCode]
              .filter(Boolean)
              .join(", ")
          : null,
      });
    } catch (err) {
      findings.push({
        provider,
        siteUrl: url,
        publisher,
        licence,
        feedUrl,
        itemType: "FacilityUse",
        hasTennisOrPadel: false,
        hasLondonTennisOrPadel: false,
        sampleItemName: null,
        sampleVenueName: null,
        sampleAddress: null,
        note: `feed fetch failed: ${err}`,
      });
    }
  }

  writeReport(findings);
  console.log("Wrote docs/data-sources.md");
}

const GUIDE_PROVIDERS = [
  "ClubSpark (LTA)",
  "Better (GLL)",
  "Park Sports (Royal Parks)",
  "Courtside (Tower Hamlets)",
  "All Star / Enable (Wandsworth)",
  "Camden Active",
];

function evidenceLine(f: FeedFinding): string {
  const parts: string[] = [];
  if (f.sampleItemName) {
    parts.push(
      `e.g. "${f.sampleItemName}" at ${f.sampleVenueName ?? "?"}${
        f.sampleAddress ? ` (${f.sampleAddress})` : ""
      }`
    );
  }
  if (f.note) parts.push(f.note);
  if (!f.feedUrl && f.itemType) parts.push(`distribution: ${f.itemType}`);
  return parts.join("; ") || "-";
}

// Picks the single most useful finding when a provider matched more than one
// dataset site (e.g. Better/GLL has an old, now-broken feed and a current one).
function bestFinding(matches: FeedFinding[]): FeedFinding {
  return (
    matches.find((f) => f.hasLondonTennisOrPadel) ??
    matches.find((f) => f.feedUrl && !f.note) ??
    matches[0]
  );
}

function writeReport(findings: FeedFinding[]) {
  const lines: string[] = [];
  lines.push("# Data sources register");
  lines.push("");
  lines.push(
    "Produced by `ingest/discover.ts` (Phase 1). It walks the OpenActive data " +
      "catalogue collection and checks the first page of each candidate feed " +
      "for real tennis/padel facilities (not table tennis) with a London " +
      "address. It does not create a database and makes no write of any kind."
  );
  lines.push("");
  lines.push(`Last run: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("## Providers from the build guide's table");
  lines.push("");
  lines.push(
    "| Provider | Feed found? | London tennis/padel seen? | Rung | Evidence |"
  );
  lines.push("| --- | --- | --- | --- | --- |");

  for (const provider of GUIDE_PROVIDERS) {
    const matches = findings.filter((f) => f.provider === provider);
    if (matches.length === 0) {
      lines.push(
        `| ${provider} | no | no | link-only (for now) | not present anywhere in the OpenActive data catalogue |`
      );
      continue;
    }
    const f = bestFinding(matches);
    const feedCell = f.feedUrl ? `[yes](${f.feedUrl})` : "no";
    const londonCell = f.hasLondonTennisOrPadel
      ? "yes"
      : f.hasTennisOrPadel
      ? "tennis/padel found, not in London (page 1)"
      : "no";
    const rung = f.hasLondonTennisOrPadel
      ? "1 — OpenActive feed"
      : f.feedUrl
      ? "feed exists but no London tennis seen yet — check further pages"
      : "link-only (for now)";
    lines.push(
      `| ${provider} | ${feedCell} | ${londonCell} | ${rung} | ${evidenceLine(f)} |`
    );
  }

  const bonus = findings.filter(
    (f) => !GUIDE_PROVIDERS.includes(f.provider) && f.hasLondonTennisOrPadel
  );
  if (bonus.length > 0) {
    lines.push("");
    lines.push(
      "## Other London council/venue feeds found with real tennis or padel"
    );
    lines.push("");
    lines.push("Not in the build guide's original provider list, found via the London-borough hostname check.");
    lines.push("");
    lines.push("| Publisher | Feed | Evidence |");
    lines.push("| --- | --- | --- |");
    for (const f of bonus) {
      lines.push(`| ${f.publisher} | ${f.feedUrl ?? "-"} | ${evidenceLine(f)} |`);
    }
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- **ClubSpark court slots**: the LTA's own feed (`lawntennisassociation.github.io`) " +
      "only distributes `https://api.clubspark.uk/odi/public/courses` — participation " +
      "courses, not court availability. No separate ClubSpark court-slot feed was found " +
      "in the OpenActive catalogue."
  );
  lines.push(
    "- **Courtside (Tower Hamlets)**: found a real OpenActive feed from the London " +
      "Borough of Tower Hamlets' own leisure centres (e.g. tennis at John Orwell Sports " +
      "Centre, E1W), via their LeisureCloud/Gladstone system. It's not confirmed whether " +
      "this is the same system as the \"Courtside\" branded outdoor park courts — worth " +
      "checking by hand before relying on it."
  );
  lines.push(
    "- **Park Sports**: no dataset site in the catalogue matches Park Sports or the " +
      "Royal Parks. Confirms the guide's plan to read their public pages in Phase 7a."
  );
  lines.push("- **Playtomic**: not present in the OpenActive catalogue at all.");
  lines.push(
    "- This only checked Bookteq-hosted sites whose hostname names a London borough " +
      "(Bookteq hosts ~80 small clubs nationwide; checking every one of them for every " +
      "provider would be impolite for a one-off discovery pass)."
  );
  lines.push("");
  writeFileSync("docs/data-sources.md", lines.join("\n") + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
