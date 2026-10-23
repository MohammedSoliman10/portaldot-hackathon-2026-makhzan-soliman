import type { Hex } from "../data/schema";

export type Mode = "RECORDED" | "LOCAL" | "LIVE";

export type ConfigField =
  | "VITE_MAKHZAN_MODE"
  | "VITE_MAKHZAN_RPC_URL"
  | "VITE_MAKHZAN_CHAIN_ID"
  | "VITE_MAKHZAN_CONTRACT_ADDRESS";

export interface ConfigError {
  field: ConfigField;
  message: string;
}

export interface AppConfig {
  requestedMode: Mode | null;
  address: Hex | null;
  rpcUrl: string | null;
  chainId: number;
  errors: ConfigError[];
}

export function parseConfig(_source: Record<string, string | undefined>): AppConfig {
  throw new Error("not implemented");
}
