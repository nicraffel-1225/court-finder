// Phase 3: generic OpenActive (RPDE) feed reader, following the next-page bookmark.
//
// RPDE ("Realtime Paged Data Exchange") is a changelog: each page lists
// items changed since the last page, ending with a "next" link. The feed
// has caught up to the present the moment a page's "next" link is the same
// URL we just requested — that's the signal to stop, not an error.
import { politeFetchJson } from "./http.ts";

export interface RpdeItem<T> {
  state: "updated" | "deleted";
  kind: string;
  id: string;
  modified: number;
  data?: T;
}

interface RpdePage<T> {
  next: string;
  items: RpdeItem<T>[];
}

const RPDE_ACCEPT =
  "application/vnd.openactive.rpde+json; version=1, application/json";

// A feed with a bug (or one we've misread) could in principle hand back an
// ever-advancing "next" forever. This is a backstop, not an expected case —
// for comparison, Better's whole slots history is under 100 pages.
const MAX_PAGES = 5000;

export interface SyncRpdeFeedResult {
  nextUrl: string;
  pagesRead: number;
  caughtUp: boolean;
}

// Pages through the feed starting at startUrl, calling onPage with each
// page's items as they arrive, plus that page's own bookmark — save it to
// data_sources.next_url after every page (not just at the end), so a crash
// resumes here instead of restarting the whole feed.
export async function syncRpdeFeed<T>(
  startUrl: string,
  onPage: (items: RpdeItem<T>[], pageBookmark: string) => Promise<void> | void,
  options: { minIntervalMs?: number } = {}
): Promise<SyncRpdeFeedResult> {
  let url = startUrl;
  let pagesRead = 0;

  while (pagesRead < MAX_PAGES) {
    const page = await politeFetchJson<RpdePage<T>>(url, {
      accept: RPDE_ACCEPT,
      minIntervalMs: options.minIntervalMs,
    });
    pagesRead++;
    const bookmark = page.next || url;
    await onPage(page.items, bookmark);

    if (!page.next || page.next === url) {
      return { nextUrl: bookmark, pagesRead, caughtUp: true };
    }
    url = page.next;
  }

  return { nextUrl: url, pagesRead, caughtUp: false };
}
