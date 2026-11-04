/**
 * Makhzan contract healthOf semantics:
 * 0 = none or settled
 * 1 = healthy (stays 1 after the end block until settled, and after a resolved slash)
 * 2 = challenge open inside its window
 * 3 = challenge open past its deadline (provider in default)
 *
 * Never label 2 as faulted or failed.
 * Any other code is "unknown" rather than a guess.
 */

export const HEALTH_TEXT: Record<number, string> = {
  0: "none or settled",
  1: "healthy",
  2: "challenge open inside its window",
  3: "challenge open past its deadline (provider in default)",
};

export function healthLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "not read";
  return HEALTH_TEXT[code] ?? "unknown";
}
