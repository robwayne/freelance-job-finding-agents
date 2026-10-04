export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to fail immediately (e.g. 4xx other than 408/429). */
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 408 || err.status === 429 || err.status >= 500;
  // Network failures from fetch surface as TypeError; aborts as AbortError/TimeoutError.
  return err instanceof TypeError || (err instanceof Error && /timeout|abort|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(`${err.name} ${err.message}`));
}

/** Exponential backoff with full jitter. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 15_000;
  const shouldRetry = opts.shouldRetry ?? isRetryable;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const delay = Math.round(Math.random() * Math.min(max, base * 2 ** attempt));
      opts.onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
}

/** fetch + JSON with timeout and retries. Throws HttpError on non-2xx. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  retry: RetryOptions = {},
): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 20_000) });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}`, text.slice(0, 500));
    return JSON.parse(text) as T;
  }, retry);
}

/** Run `fn` over items with at most `limit` in flight. Results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
