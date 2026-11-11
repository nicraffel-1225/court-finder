import { describe, expect, it, vi } from "vitest";
import { cached } from "./cache.ts";

describe("cached", () => {
  it("returns a cached value without calling the fetcher again", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh");
    const key = `test-${Math.random()}`;

    expect(await cached(key, 1000, fetcher)).toBe("fresh");
    expect(await cached(key, 1000, fetcher)).toBe("fresh");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the cached value has expired", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const key = `test-${Math.random()}`;

    expect(await cached(key, 10, fetcher)).toBe("first");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await cached(key, 10, fetcher)).toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("joins an in-flight fetch instead of starting a second one (the refresh-mid-load case)", async () => {
    const fetcher = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve("slow-result"), 30))
    );
    const key = `test-${Math.random()}`;

    const [a, b] = await Promise.all([cached(key, 1000, fetcher), cached(key, 1000, fetcher)]);
    expect(a).toBe("slow-result");
    expect(b).toBe("slow-result");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("doesn't cache a failed fetch, so the next call tries again", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("recovered");
    const key = `test-${Math.random()}`;

    await expect(cached(key, 1000, fetcher)).rejects.toThrow("boom");
    expect(await cached(key, 1000, fetcher)).toBe("recovered");
  });
});
