/**
 * Conversion and formatting constants for tPOT amounts.
 *
 * In Portaldot / Substrate:
 *   - Native unit is planck: 1 tPOT = 10^14 planck (14 decimals).
 *   - Makhzan contract stores prices, bonds, claims and slashes in planck (uint64).
 *   - StorageGate.minBond floor is in planck (uint64).
 *
 * In EVM:
 *   - Native unit is wei: 1 tPOT = 10^18 wei (18 decimals).
 *   - StorageGate.lock(..., msg.value) stores deposit in wei (uint96).
 *   - Ratio: 1 planck = 10,000 wei (WEI_PER_PLANCK).
 */
export const PLANCK_PER_TPOT = 100_000_000_000_000n; // 1e14
export const WEI_PER_TPOT = 1_000_000_000_000_000_000n; // 1e18
export const WEI_PER_PLANCK = 10_000n; // 1e4
export const TPOT_DECIMALS = 14;

/** 5e14 planck -> "5.00000000000000". Fixed width (14 decimals), so two amounts can be compared by eye. */
export function formatTpotFromPlanck(planck: bigint): string {
  const negative = planck < 0n;
  const value = negative ? -planck : planck;
  const whole = value / PLANCK_PER_TPOT;
  const fraction = (value % PLANCK_PER_TPOT).toString().padStart(TPOT_DECIMALS, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** 2e18 wei -> "2.00000000000000". Fixed width (14 decimals), matching tPOT precision. */
export function formatTpotFromWei(wei: bigint): string {
  const negative = wei < 0n;
  const value = negative ? -wei : wei;
  const whole = value / WEI_PER_TPOT;
  const fractionPlanck = (value % WEI_PER_TPOT) / WEI_PER_PLANCK;
  const fraction = fractionPlanck.toString().padStart(TPOT_DECIMALS, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Default format helper: converts planck (or wei if unit === "wei") to 14-decimal tPOT string. */
export function formatTpot(value: bigint, unit: "planck" | "wei" = "planck"): string {
  return unit === "wei" ? formatTpotFromWei(value) : formatTpotFromPlanck(value);
}

/** Strips trailing zeros from a formatted decimal string: "2.00000000000000" -> "2", "2.50000000000000" -> "2.5". */
export function cleanTpot(formatted: string): string {
  if (!formatted.includes(".")) return formatted;
  const stripped = formatted.replace(/0+$/, "").replace(/\.$/, "");
  return stripped === "-0" ? "0" : stripped;
}

/** Convert native wei (1e18 per tPOT) to planck (1e14 per tPOT). */
export function weiToPlanck(wei: bigint): bigint {
  return wei / WEI_PER_PLANCK;
}

/** Convert planck (1e14 per tPOT) to wei (1e18 per tPOT). */
export function planckToWei(planck: bigint): bigint {
  return planck * WEI_PER_PLANCK;
}

/** Parse a decimal tPOT string to wei (e.g. "2" -> 2_000_000_000_000_000_000n). */
export function parseTpotToWei(tpotStr: string): bigint {
  const s = tpotStr.trim();
  const negative = s.startsWith("-");
  const abs = negative ? s.slice(1) : s;
  const [whole, fraction = ""] = abs.split(".");
  const paddedFraction = fraction.padEnd(18, "0").slice(0, 18);
  const val = BigInt(whole) * WEI_PER_TPOT + BigInt(paddedFraction);
  return negative ? -val : val;
}

/** Parse a decimal tPOT string to planck (e.g. "20" -> 2_000_000_000_000_000n). */
export function parseTpotToPlanck(tpotStr: string): bigint {
  const s = tpotStr.trim();
  const negative = s.startsWith("-");
  const abs = negative ? s.slice(1) : s;
  const [whole, fraction = ""] = abs.split(".");
  const paddedFraction = fraction.padEnd(TPOT_DECIMALS, "0").slice(0, TPOT_DECIMALS);
  const val = BigInt(whole) * PLANCK_PER_TPOT + BigInt(paddedFraction);
  return negative ? -val : val;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
