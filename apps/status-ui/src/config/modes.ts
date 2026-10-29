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
  gateAddress: Hex | null;
  gateAddressError: string | null;
}

/**
 * The mode matrix from `research.md` D-06, as a pure function.
 *
 * `RECORDED` never enables a client. `LOCAL` is never inferred. A live request that lacks an address
 * or an RPC URL becomes a blocking configuration notice and keeps the recorded layer readable.
 */
export function resolveMode(config: AppConfig): ModeState {
  const base = {
    requested: config.requestedMode,
    address: config.address,
    rpcUrl: config.rpcUrl,
    expectedChainId: config.chainId,
    observedChainId: null,
    gateAddress: config.gateAddress,
    gateAddressError: config.gateAddressError,
  };

  if (config.errors.length > 0) {
    return {
      ...base,
      mode: "RECORDED",
      clientEnabled: false,
      blocking: { kind: "config", detail: config.errors[0]!.message },
    };
  }

  if (config.requestedMode === "RECORDED") {
    return { ...base, mode: "RECORDED", clientEnabled: false, blocking: null };
  }

  const liveMode = config.requestedMode;
  if (liveMode === "LIVE" || liveMode === "LOCAL") {
    if (!config.address) {
      return {
        ...base,
        mode: "RECORDED",
        clientEnabled: false,
        blocking: {
          kind: "config",
          detail: `${config.requestedMode} needs a contract address; showing recorded evidence`,
        },
      };
    }
    if (!config.rpcUrl) {
      return {
        ...base,
        mode: "RECORDED",
        clientEnabled: false,
        blocking: {
          kind: "config",
          detail: `${config.requestedMode} needs an RPC URL; showing recorded evidence`,
        },
      };
    }
    return { ...base, mode: liveMode, clientEnabled: true, blocking: null };
  }

  if (config.address && config.rpcUrl) {
    return { ...base, mode: "LIVE", clientEnabled: true, blocking: null };
  }

  if (config.address && !config.rpcUrl) {
    return {
      ...base,
      mode: "RECORDED",
      clientEnabled: false,
      blocking: {
        kind: "config",
        detail: "an address is set but no RPC URL is configured; showing recorded evidence",
      },
    };
  }

  return { ...base, mode: "RECORDED", clientEnabled: false, blocking: null };
}
