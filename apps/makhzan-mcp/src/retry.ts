/**
 * One retry per read, each attempt bounded by an explicit budget.
 *
 * A tool call that already failed twice must fail loudly: a silent empty answer would look like a
 * verdict about the deal. The label is the read that failed ("healthOf", "eth_getLogs", ...) so the
 * message says which call the node did not answer.
 */
export interface RetryOptions {
  /** Per-attempt budget. Omitted means no timer, used by the unit tests only. */
  timeoutMs?: number;
  /** Number of attempts; MCP tools use the default of two. */
  attempts?: number;
  /** Return false for an error a second attempt cannot change (a deal that does not exist). */
  retryable?: (error: unknown) => boolean;
}

export async function withRetry<T>(label: string, fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 2;
  const seen: string[] = [];

  for (let done = 1; ; done++) {
    try {
      return await once(label, fn, options.timeoutMs);
    } catch (error) {
      if (options.retryable && !options.retryable(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      seen.push(message);
      if (done >= attempts) {
        throw new Error(`${label} failed after ${attempts} attempts: ${seen.join("; ")}`);
      }
    }
  }
}

/**
 * Runs one attempt and turns a missed deadline into the same kind of error a node failure produces,
 * so both reasons read the same way in the final message.
 */
async function once<T>(label: string, fn: () => Promise<T>, timeoutMs: number | undefined): Promise<T> {
  if (timeoutMs === undefined) return fn();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
