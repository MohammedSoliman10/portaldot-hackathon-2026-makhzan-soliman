/** The only two formats the tools print: planck as tPOT, and counts with thousands separators. */
export const PLANCK_PER_TPOT = 100_000_000_000_000n;
export const TPOT_DECIMALS = 14;

/** 5e14 planck -> "5.00000000000000". Fixed width, so two amounts can be compared by eye. */
export function formatTpot(planck: bigint): string {
  const negative = planck < 0n;
  const value = negative ? -planck : planck;
  const whole = value / PLANCK_PER_TPOT;
  const fraction = (value % PLANCK_PER_TPOT).toString().padStart(TPOT_DECIMALS, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
