// src/lib/rateLimit.ts
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sehr simple Rate-Limit-Queue: sorgt dafür, dass async Tasks
 * nicht schneller als `minIntervalMs` gestartet werden.
 */
export function createLimiter(minIntervalMs: number) {
  let last = 0;

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const wait = Math.max(0, minIntervalMs - (now - last));
    if (wait) await sleep(wait);
    last = Date.now();
    return fn();
  };
}

/**
 * Retry bei 429/5xx mit Exponential Backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number }
): Promise<T> {
  const retries = opts?.retries ?? 6;
  const baseDelayMs = opts?.baseDelayMs ?? 350;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const status = Number(e?.status ?? e?.cause?.status ?? 0);

      const is429 = status === 429 || msg.includes(" 429 ") || msg.includes("Exceeded 2 calls per second");
      const is5xx = status >= 500 && status < 600;

      if (!(is429 || is5xx) || attempt >= retries) throw e;

      const delay = baseDelayMs * Math.pow(2, attempt); // 350, 700, 1400, ...
      await sleep(delay);
      attempt++;
    }
  }
}
