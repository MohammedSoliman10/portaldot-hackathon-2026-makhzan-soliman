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

export function metric<T>(_input: MetricInput<T>): Metric<T> {
  throw new Error("not implemented");
}

export function pendingLiveRun(_source: string): Metric<never> {
  throw new Error("not implemented");
}

export function toDecimal(_raw: string): bigint {
  throw new Error("not implemented");
}

export function formatNative(_units: string): string {
  throw new Error("not implemented");
}

export function formatWei(_wei: string): string {
  throw new Error("not implemented");
}

export function formatCount(_value: number): string {
  throw new Error("not implemented");
}

export function formatBytes(_bytes: number): string {
  throw new Error("not implemented");
}
