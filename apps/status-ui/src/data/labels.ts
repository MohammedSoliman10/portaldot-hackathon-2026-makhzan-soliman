export const LABELS = ["MEASURED", "REPORTED", "SIMULATED", "PENDING LIVE RUN"] as const;
export type Label = (typeof LABELS)[number];

export interface Metric<T = string> {
  value: T | null;
  unit: string;
  label: Label;
  source: string;
  at: string | null;
  stale: boolean;
  unavailableReason: string | null;
}

export interface MetricInput<T = string> {
  value: T | null;
  unit: string;
  label: Label;
  source: string;
  at?: string | null;
  stale?: boolean;
  unavailableReason?: string | null;
}

/** Native tPOT has 14 decimals on Portaldot; wei is 18-decimal and always shown as wei. */
const NATIVE_DECIMALS = 14;
const NATIVE_BASE = 10n ** BigInt(NATIVE_DECIMALS);

const group = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * The one constructor for a number on screen. It refuses the states that make a page dishonest:
 * no label, no source, a value that claims to be pending, and a stale badge on a reported value.
 */
export function metric<T>(input: MetricInput<T>): Metric<T> {
  if (!LABELS.includes(input.label)) {
    throw new Error(`metric: label must be one of ${LABELS.join(", ")}`);
  }
  if (!input.source || input.source.trim() === "") {
    throw new Error("metric: a source is required");
  }
  if (input.value !== null && input.label === "PENDING LIVE RUN") {
    throw new Error("metric: PENDING LIVE RUN must not carry a value");
  }
  if (input.value === null && !input.unavailableReason) {
    throw new Error("metric: a missing value needs a reason");
  }
  if (input.stale && input.label !== "MEASURED") {
    throw new Error("metric: only a measured value can be stale");
  }
  return {
    value: input.value,
    unit: input.unit,
    label: input.label,
    source: input.source,
    at: input.at ?? null,
    stale: input.stale ?? false,
    unavailableReason: input.unavailableReason ?? null,
  };
}

export function pendingLiveRun(source: string): Metric<never> {
  return {
    value: null,
    unit: "",
    label: "PENDING LIVE RUN",
    source,
    at: null,
    stale: false,
    unavailableReason: "pending live run — no value exists in the evidence",
  };
}

/** Parses a native-unit decimal string with integer math only. Rejects floats, signs and padding. */
export function toDecimal(raw: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(`amount "${raw}" is not a non-negative decimal integer`);
  }
  return BigInt(raw);
}

export function formatNative(units: string): string {
  const value = toDecimal(units);
  if (value === 0n) return "0";
  const whole = value / NATIVE_BASE;
  const fraction = value % NATIVE_BASE;
  if (fraction === 0n) return group(whole.toString());
  const decimals = fraction.toString().padStart(NATIVE_DECIMALS, "0").slice(0, 4).replace(/0+$/, "");
  if (decimals === "") return "< 0.0001";
  return `${group(whole.toString())}.${decimals}`;
}

/** 18-decimal wei to native tPOT (1 tPOT = 1e18 wei), integer math only. */
export function formatWeiAsNative(wei: string): string {
  const value = toDecimal(wei);
  const base = 10n ** 18n;
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return group(whole.toString());
  const decimals = fraction.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return decimals === "" ? group(whole.toString()) : `${group(whole.toString())}.${decimals}`;
}

export function formatWei(wei: string): string {
  return group(toDecimal(wei).toString());
}

export function formatCount(value: number): string {
  if (!Number.isSafeInteger(value)) throw new Error(`count ${value} is not a safe integer`);
  return group(String(value));
}

export function formatBytes(bytes: number): string {
  return `${formatCount(bytes)} bytes`;
}
