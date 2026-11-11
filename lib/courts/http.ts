// Polite fetch helper — User-Agent, rate limits, backoff on 429/5xx.
//
// CLAUDE.md's polite-fetching rule is "at most 1 request per second per
// host, back off on 429/5xx". This enforces that per hostname (not
// globally), so fetching several venues on one page load never queues
// behind a single slow one, and retries a failed request a few times with
// an increasing delay before giving up.

export const USER_AGENT = "LondonCourtFinder/0.1 (+mailto:courtwatch.ldn@gmail.com)";

const MIN_INTERVAL_MS = 1000;
const MAX_RETRIES = 3;

// Each host's next free slot, reserved the instant a call asks for one —
// not after that call's own wait finishes. The website fetches several
// days/courts for the same host concurrently (lib/courts/lta.ts and
// proagenda.ts both use Promise.all), so several calls can ask for a slot
// in the same tick; reserving synchronously, before any `await`, is what
// actually staggers them a second apart instead of letting them all wait
// out the same stale timestamp and then fire together.
const nextFreeAtByHost = new Map<string, number>();

async function waitForTurn(hostname: string, minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const earliestStart = Math.max(now, nextFreeAtByHost.get(hostname) ?? 0);
  nextFreeAtByHost.set(hostname, earliestStart + minIntervalMs);
  const waitMs = earliestStart - now;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null, baseDelayMs: number): number {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterSeconds)) return retryAfterSeconds * 1000;
  return 2 ** attempt * baseDelayMs; // e.g. 1s, 2s, 4s at the default base
}

export interface PoliteFetchOptions {
  accept?: string;
  minIntervalMs?: number;
  retryBaseDelayMs?: number;
  method?: string;
  body?: string;
  contentType?: string;
}

// Fetches one URL, waiting out this host's rate limit first and retrying
// with backoff on 429/5xx. Any other non-2xx response fails immediately —
// there's nothing to back off from on a 404 or 403.
export async function politeFetchText(
  url: string,
  options: PoliteFetchOptions = {}
): Promise<string> {
  const hostname = new URL(url).hostname;
  const minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 1000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForTurn(hostname, minIntervalMs);

    const res = await fetch(url, {
      method: options.method ?? "GET",
      body: options.body,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept ?? "application/json",
        ...(options.body ? { "Content-Type": options.contentType ?? "application/json" } : {}),
      },
    });

    if (res.ok) return res.text();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_RETRIES) {
      throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, retryDelayMs(attempt, res.headers.get("retry-after"), retryBaseDelayMs))
    );
  }

  // Unreachable — the loop above always returns or throws — but keeps
  // TypeScript happy about the function's return type.
  throw new Error(`Exhausted retries fetching ${url}`);
}

export async function politeFetchJson<T = unknown>(
  url: string,
  options: PoliteFetchOptions = {}
): Promise<T> {
  const text = await politeFetchText(url, options);
  return JSON.parse(text) as T;
}
