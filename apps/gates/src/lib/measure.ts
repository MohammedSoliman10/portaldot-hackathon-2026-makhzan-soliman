import type { CostMeasurement } from "./evidence.ts";

export type MeasurementMethod = CostMeasurement["method"];

export interface Sample {
  label: string;
  value: number;
}

export interface MeasurementInput {
  name: string;
  value: number | string;
  unit: string;
  method: MeasurementMethod;
  conditions: Record<string, string | number>;
  txRef?: string | null;
  samples?: Sample[];
}

export class MeasurementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeasurementError";
  }
}

/** Build a measurement, refusing any that cannot be reproduced from its method. */
export function makeMeasurement(input: MeasurementInput): CostMeasurement {
  if (!input.method) throw new MeasurementError(`measurement ${input.name} is missing a method`);
  if (input.value === undefined || input.value === null) {
    throw new MeasurementError(`measurement ${input.name} is missing a value`);
  }
  if (!input.unit) throw new MeasurementError(`measurement ${input.name} is missing a unit`);

  if (input.method === "receipt" && !input.txRef) {
    throw new MeasurementError(`measurement ${input.name} uses receipt method without txRef`);
  }
  if (input.method === "differential") {
    const samples = input.samples ?? [];
    if (samples.length < 2 || samples.some((sample) => !sample.label)) {
      throw new MeasurementError(`measurement ${input.name} uses differential without two labelled samples`);
    }
  }

  return {
    name: input.name,
    value: input.value,
    unit: input.unit,
    method: input.method,
    conditions: input.conditions,
    txRef: input.txRef ?? null,
  };
}

export function differentialMeasurement(input: {
  name: string;
  unit: string;
  conditions: Record<string, string | number>;
  a: Sample;
  b: Sample;
}): CostMeasurement {
  const value = input.b.value - input.a.value;
  return makeMeasurement({
    name: input.name,
    value,
    unit: input.unit,
    method: "differential",
    conditions: {
      ...input.conditions,
      samples: `${input.a.label}=${input.a.value};${input.b.label}=${input.b.value}`,
    },
    samples: [input.a, input.b],
  });
}

/** Gas from a receipt, tagged by its transaction hash. */
export function receiptGas(name: string, gasUsed: bigint, txRef: string, conditions: Record<string, string | number>): CostMeasurement {
  return makeMeasurement({
    name,
    value: Number(gasUsed),
    unit: "gas",
    method: "receipt",
    conditions,
    txRef,
  });
}

/** Gas from eth_estimateGas, before a transaction exists. */
export function estimateGasMeasurement(
  name: string,
  gas: bigint,
  conditions: Record<string, string | number>,
): CostMeasurement {
  return makeMeasurement({
    name,
    value: Number(gas),
    unit: "gas",
    method: "estimate",
    conditions,
  });
}

export function ratio(name: string, numerator: number, denominator: number, conditions: Record<string, string | number>): CostMeasurement {
  if (denominator === 0) throw new MeasurementError(`ratio ${name} has a zero denominator`);
  return makeMeasurement({
    name,
    value: numerator / denominator,
    unit: "ratio",
    method: "differential",
    conditions: {
      ...conditions,
      numerator,
      denominator,
    },
    samples: [
      { label: "numerator", value: numerator },
      { label: "denominator", value: denominator },
    ],
  });
}
