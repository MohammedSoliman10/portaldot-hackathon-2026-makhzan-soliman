/** Native-unit conversion shared by the CLI, the daemon and the deploy script. */
export const TPOT_DECIMALS = 14;
export const WEI_PER_UNIT = 10_000n;
export const MAX_UNITS = 2n ** 64n - 1n;

/** Converts a decimal tPOT string ("10", "1.5") to native units (10 tPOT = 10^15 units). */
export function tPotToUnits(_text: string): bigint {
  throw new Error("not implemented");
}

/** Converts native units to wei for msg.value (units * WEI_PER_UNIT). */
export function unitsToWei(_units: bigint): bigint {
  throw new Error("not implemented");
}
