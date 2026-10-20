export type GateId =
  | "G01"
  | "G02"
  | "G03"
  | "G04"
  | "G05"
  | "G06"
  | "G07"
  | "G08"
  | "G09"
  | "G10";

export interface GateDefinition {
  readonly id: GateId;
  readonly order: number;
  readonly optional: boolean;
  readonly title: string;
  /** Measurement names that must be present when the gate verdict is PASS. */
  readonly requiredMeasurements: readonly string[];
}

/** One source of truth for ids, order, optionality and required measurements. */
export const GATES: readonly GateDefinition[] = [
  { id: "G10", order: 1, optional: false, title: "RPC probe", requiredMeasurements: ["coverage-pct"] },
  { id: "G07", order: 2, optional: false, title: "Funding and mapping", requiredMeasurements: ["implied-factor"] },
  { id: "G01", order: 3, optional: false, title: "Deploy and call", requiredMeasurements: ["deploy-gas"] },
  { id: "G02", order: 4, optional: false, title: "Chain behavior", requiredMeasurements: ["size-limit-bytes"] },
  { id: "G03", order: 5, optional: false, title: "Randomness", requiredMeasurements: ["call-samples", "tx-samples"] },
  { id: "G04", order: 6, optional: false, title: "Proof limits", requiredMeasurements: ["max-response-bytes"] },
  { id: "G05", order: 7, optional: false, title: "Storage", requiredMeasurements: ["marginal-slot-gas"] },
  { id: "G06", order: 8, optional: false, title: "Challenge round cost", requiredMeasurements: ["round-cost"] },
  { id: "G08", order: 9, optional: false, title: "Identity", requiredMeasurements: ["identity-write"] },
  { id: "G09", order: 10, optional: true, title: "Assets precompile", requiredMeasurements: [] },
];

export function isGateId(value: string): value is GateId {
  return GATES.some((gate) => gate.id === value.toUpperCase());
}

export function getGate(gateId: string): GateDefinition {
  const gate = GATES.find((entry) => entry.id === gateId.toUpperCase());
  if (!gate) throw new Error(`unknown gate ${gateId}`);
  return gate;
}

export function gatesAfter(gateId: string): GateDefinition[] {
  const gate = getGate(gateId);
  return GATES.filter((entry) => entry.order > gate.order);
}
