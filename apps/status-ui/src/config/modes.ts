import type { AppConfig, Mode } from "./env";
import type { Hex } from "../data/schema";

export interface BlockingCondition {
  kind: "config" | "chain-mismatch" | "no-code" | "evidence-mismatch";
  detail: string;
}

export interface ModeState {
  mode: Mode;
  requested: Mode | null;
  address: Hex | null;
  rpcUrl: string | null;
  expectedChainId: number;
  observedChainId: number | null;
  clientEnabled: boolean;
  blocking: BlockingCondition | null;
}

export function resolveMode(_config: AppConfig): ModeState {
  throw new Error("not implemented");
}
