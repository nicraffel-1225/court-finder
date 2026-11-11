// A short in-memory cache so checking again soon after is instant instead
// of re-fetching from every real site again (CLAUDE.md's "cache responses"
// polite-fetching rule). Keyed by whatever string the caller gives it, kept
// per server process — a fresh serverless instance just starts empty, but
// the same warm instance (e.g. local dev, or a Vercel instance reused for
// the next visit) serves repeat checks instantly.
const store = new Map<string, { data: unknown; expiresAt: number }>();

// A page refresh while the previous load is still fetching doesn't cancel
// it — the abandoned request's fetches keep running and keep taking their
// turn on the shared per-host throttle (lib/courts/http.ts), right
// alongside the new request's own fetches, so refreshing mid-load made
// things slower, not faster. Tracking in-flight fetches here means a
// second call for the same venue while one's already running just joins
// it instead of starting a competing one.
const inFlight = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.data as T);

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      store.set(key, { data, expiresAt: Date.now() + ttlMs });
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
