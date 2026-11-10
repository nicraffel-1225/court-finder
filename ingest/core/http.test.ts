// Phase 3. No network: fetch is mocked throughout (CLAUDE.md rule 7).
import { afterEach, describe, expect, it, vi } from "vitest";
import { politeFetchJson, politeFetchText } from "./http.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("politeFetchText", () => {
  it("waits at least minIntervalMs between two requests to the same host", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://host-a.example/one";
    const start = Date.now();
    await politeFetchText(url, { minIntervalMs: 60 });
    await politeFetchText(url, { minIntervalMs: 60 });
    const elapsed = Date.now() - start;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(55);
  });

  it("does not wait for a different host", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await politeFetchText("https://host-b.example/one", { minIntervalMs: 60 });
    const start = Date.now();
    await politeFetchText("https://host-c.example/one", { minIntervalMs: 60 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(55);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const text = await politeFetchText("https://host-d.example/one", { minIntervalMs: 1 });
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated 500s", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response("boom", { status: 500, statusText: "Server Error" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      politeFetchText("https://host-e.example/one", { minIntervalMs: 1, retryBaseDelayMs: 1 })
    ).rejects.toThrow(/500/);
  });

  it("fails immediately on a non-retryable status like 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 404, statusText: "Not Found" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(politeFetchText("https://host-f.example/one", { minIntervalMs: 1 })).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("politeFetchJson", () => {
  it("parses the response body as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hello: "world" }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await politeFetchJson<{ hello: string }>("https://host-g.example/one", { minIntervalMs: 1 });
    expect(data.hello).toBe("world");
  });
});
