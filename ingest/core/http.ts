// Phase 3: polite fetch helper — User-Agent, rate limits, backoff on 429/5xx.
//
// CLAUDE.md's polite-fetching rule is "at most 1 request per second per
// host, back off on 429/5xx". This enforces that per hostname (not
// globally), so syncing several providers in the same run never queues
// behind a single slow one, and retries a failed request a few times with
// an increasing delay before giving up.

export const USER_AGENT = "LondonCourtFinder/0.1 (+mailto:courtwatch.ldn@gmail.com)";

const MIN_INTERVAL_MS = 1000;
const MAX_RETRIES = 3;

const lastRequestAtByHost = new Map<string, number>();

async function waitForTurn(hostname: string, minIntervalMs: number): Promise<void> {
  const lastAt = lastRequestAtByHost.get(hostname) ?? 0;
  const waitMs = minIntervalMs - (Date.now() - lastAt);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAtByHost.set(hostname, Date.now());
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
