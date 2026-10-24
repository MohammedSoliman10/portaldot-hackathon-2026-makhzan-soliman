/**
 * Native-unit conversion shared by the CLI, the daemon and the deploy script.
 *
 * Amounts are passed to the contract in native units, never in wei: the constructor takes
 * minBond in units (10 tPOT = 10^15 units) and msg.value is units * WEI_PER_UNIT. Decimal tPOT
 * inputs are parsed as strings with integer math only; floats are never used.
 */
export const TPOT_DECIMALS = 14;
export const WEI_PER_UNIT = 10_000n;
export const MAX_UNITS = 2n ** 64n - 1n;

/** Converts a decimal tPOT string ("10", "1.5") to native units (10 tPOT = 10^15 units). */
export function tPotToUnits(text: string): bigint {
  const s = text.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`invalid tPOT amount in units: ${JSON.stringify(text)}`);
  }
  const [whole, fraction = ""] = s.split(".");
  if (fraction.length > TPOT_DECIMALS) {
    throw new Error(`more than ${TPOT_DECIMALS} decimal places; one unit is 1e-${TPOT_DECIMALS} tPOT`);
  }
  const units = BigInt(whole) * 10n ** BigInt(TPOT_DECIMALS) + BigInt(fraction.padEnd(TPOT_DECIMALS, "0"));
  if (units > MAX_UNITS) throw new Error("amount exceeds the uint64 unit cap");
  return units;
}

/** Converts native units to wei for msg.value (units * WEI_PER_UNIT). */
export function unitsToWei(units: bigint): bigint {
  if (units < 0n || units > MAX_UNITS) throw new Error("units outside the uint64 cap");
  return units * WEI_PER_UNIT;
}
