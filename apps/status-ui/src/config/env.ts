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

export const DEFAULT_CHAIN_ID = 420420777;

const MODES: readonly Mode[] = ["RECORDED", "LOCAL", "LIVE"];
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const read = (source: Record<string, string | undefined>, field: ConfigField): string | null => {
  const value = source[field];
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Reads exactly the four public build-time variables. Anything else in the environment is ignored,
 * and an unusable value becomes a typed error rather than a silent fallback.
 */
export function parseConfig(source: Record<string, string | undefined>): AppConfig {
  const errors: ConfigError[] = [];

  const rawMode = read(source, "VITE_MAKHZAN_MODE");
  let requestedMode: Mode | null = null;
  if (rawMode !== null) {
    if ((MODES as readonly string[]).includes(rawMode)) {
      requestedMode = rawMode as Mode;
    } else {
      errors.push({
        field: "VITE_MAKHZAN_MODE",
        message: `VITE_MAKHZAN_MODE "${rawMode}" is not one of ${MODES.join(", ")}`,
      });
    }
  }

  const rawAddress = read(source, "VITE_MAKHZAN_CONTRACT_ADDRESS");
  let address: Hex | null = null;
  if (rawAddress !== null) {
    if (ADDRESS_PATTERN.test(rawAddress)) address = rawAddress as Hex;
    else {
      errors.push({
        field: "VITE_MAKHZAN_CONTRACT_ADDRESS",
        message: "VITE_MAKHZAN_CONTRACT_ADDRESS must be 0x followed by 40 hex characters",
      });
    }
  }

  const rawRpcUrl = read(source, "VITE_MAKHZAN_RPC_URL");
  let rpcUrl: string | null = null;
  if (rawRpcUrl !== null) {
    if (/^https?:\/\/\S+$/i.test(rawRpcUrl)) rpcUrl = rawRpcUrl;
    else {
      errors.push({
        field: "VITE_MAKHZAN_RPC_URL",
        message: "VITE_MAKHZAN_RPC_URL must be an http:// or https:// URL",
      });
    }
  }

  const rawChainId = read(source, "VITE_MAKHZAN_CHAIN_ID");
  let chainId = DEFAULT_CHAIN_ID;
  if (rawChainId !== null) {
    const parsed = Number(rawChainId);
    if (Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === rawChainId) {
      chainId = parsed;
    } else {
      errors.push({
        field: "VITE_MAKHZAN_CHAIN_ID",
        message: `VITE_MAKHZAN_CHAIN_ID "${rawChainId}" is not a positive integer chain id`,
      });
    }
  }

  return { requestedMode, address, rpcUrl, chainId, errors };
}
