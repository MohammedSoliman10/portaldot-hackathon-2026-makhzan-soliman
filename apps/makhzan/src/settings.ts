/**
 * Environment settings for the CLI and daemon.
 *
 * There is no default network: MAKHZAN_NETWORK must be `local` or `live`. On `local` the RPC URL and
 * chain id default to the documented local values; on `live` both must be supplied. The signing key
 * is read from MAKHZAN_PRIVATE_KEY only, never from argv, never logged, never written to state.
 */
import type { Hex } from "viem";

export const LOCAL_CHAIN_ID = 420_420_777;
export const LOCAL_RPC = "http://127.0.0.1:8549";
export const DEFAULT_STATE_DIR = ".state";
export const DEFAULT_DAEMON_PORT = 8787;
export const DEFAULT_POLL_MS = 6000;

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

export interface Settings {
  network: "local" | "live";
  rpcUrl: string;
  chainId: number;
  contract: Hex;
  key: Hex;
  stateDir: string;
  daemonPort: number;
  pollMs: number;
  daemonUrl: string;
}

function integer(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new SettingsError(`${name} must be a non-negative integer (got ${JSON.stringify(value)})`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new SettingsError(`${name} must be a positive integer (got ${value})`);
  return parsed;
}

function address(value: string | undefined): Hex {
  if (!value) throw new SettingsError("MAKHZAN_CONTRACT is not set; the deployed address is required");
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new SettingsError("MAKHZAN_CONTRACT must be 20 bytes of hex");
  return value as Hex;
}

export function loadSettings(env: NodeJS.ProcessEnv): Settings {
  const network = env.MAKHZAN_NETWORK;
  if (network !== "local" && network !== "live") {
    throw new SettingsError(`MAKHZAN_NETWORK must be set to "local" or "live" (got ${JSON.stringify(network ?? null)})`);
  }

  let rpcUrl: string;
  let chainId: number;
  if (network === "live") {
    if (!env.MAKHZAN_RPC_URL) throw new SettingsError("MAKHZAN_NETWORK=live needs MAKHZAN_RPC_URL");
    if (!env.MAKHZAN_CHAIN_ID) throw new SettingsError("MAKHZAN_NETWORK=live needs MAKHZAN_CHAIN_ID");
    rpcUrl = env.MAKHZAN_RPC_URL;
    chainId = integer(env.MAKHZAN_CHAIN_ID, "MAKHZAN_CHAIN_ID");
  } else {
    rpcUrl = env.MAKHZAN_RPC_URL ?? LOCAL_RPC;
    chainId = env.MAKHZAN_CHAIN_ID ? integer(env.MAKHZAN_CHAIN_ID, "MAKHZAN_CHAIN_ID") : LOCAL_CHAIN_ID;
  }

  const key = env.MAKHZAN_PRIVATE_KEY;
  if (!key) throw new SettingsError("MAKHZAN_PRIVATE_KEY is not set; keys are never accepted on argv");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new SettingsError("MAKHZAN_PRIVATE_KEY must be 32 bytes of hex");
  }

  const daemonPort = env.MAKHZAN_DAEMON_PORT
    ? integer(env.MAKHZAN_DAEMON_PORT, "MAKHZAN_DAEMON_PORT")
    : DEFAULT_DAEMON_PORT;
  const pollMs = env.MAKHZAN_POLL_MS ? integer(env.MAKHZAN_POLL_MS, "MAKHZAN_POLL_MS") : DEFAULT_POLL_MS;
  const daemonUrl = env.MAKHZAN_DAEMON_URL ?? `http://127.0.0.1:${daemonPort}`;

  return {
    network,
    rpcUrl,
    chainId,
    contract: address(env.MAKHZAN_CONTRACT),
    key: key as Hex,
    stateDir: env.MAKHZAN_STATE_DIR ?? DEFAULT_STATE_DIR,
    daemonPort,
    pollMs,
    daemonUrl,
  };
}
