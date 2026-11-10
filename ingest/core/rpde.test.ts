// Phase 3. No network: fetch is mocked with a tiny fake feed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncRpdeFeed, type RpdeItem } from "./rpde.ts";

interface Thing {
  name: string;
}

function page(items: RpdeItem<Thing>[], next: string) {
  return new Response(JSON.stringify({ items, next }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncRpdeFeed", () => {
  it("follows next links and stops when next repeats the current url (caught up)", async () => {
    const url1 = "https://feed.example/start";
    const url2 = "https://feed.example/page2";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        page([{ state: "updated", kind: "Thing", id: "a", modified: 1, data: { name: "A" } }], url2)
      )
      .mockResolvedValueOnce(
        page([{ state: "updated", kind: "Thing", id: "b", modified: 2, data: { name: "B" } }], url2)
      );
    vi.stubGlobal("fetch", fetchMock);

    const seenIds: string[] = [];
    const bookmarksAfterEachPage: string[] = [];
    const result = await syncRpdeFeed<Thing>(
      url1,
      (items, bookmark) => {
        seenIds.push(...items.map((i) => i.id));
        bookmarksAfterEachPage.push(bookmark);
      },
      { minIntervalMs: 1 }
    );

    expect(seenIds).toEqual(["a", "b"]);
    expect(bookmarksAfterEachPage).toEqual([url2, url2]);
    expect(result).toEqual({ nextUrl: url2, pagesRead: 2, caughtUp: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resumes from whatever startUrl is passed in (the saved bookmark)", async () => {
    const bookmarkUrl = "https://feed.example/resume-here";
    const fetchMock = vi.fn().mockResolvedValueOnce(page([], bookmarkUrl));
    vi.stubGlobal("fetch", fetchMock);

    await syncRpdeFeed<Thing>(bookmarkUrl, () => {}, { minIntervalMs: 1 });

    expect(fetchMock).toHaveBeenCalledWith(bookmarkUrl, expect.anything());
  });

  it("passes deleted items through to onPage with no data", async () => {
    const url = "https://feed.example/start";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      page([{ state: "deleted", kind: "Thing", id: "gone", modified: 3 }], url)
    );
    vi.stubGlobal("fetch", fetchMock);

    let received: RpdeItem<Thing>[] = [];
    await syncRpdeFeed<Thing>(
      url,
      (items) => {
        received = items;
      },
      { minIntervalMs: 1 }
    );

    expect(received).toEqual([{ state: "deleted", kind: "Thing", id: "gone", modified: 3 }]);
  });
});
