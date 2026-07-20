const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries an async function with exponential backoff. Used to smooth over
// transient blips when calling external APIs (GNews, OpenAI). It retries on any
// thrown error — the caller controls what's retryable by what fn throws.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 300;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      // exponential backoff: 300ms, 600ms, 1200ms, ...
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}
