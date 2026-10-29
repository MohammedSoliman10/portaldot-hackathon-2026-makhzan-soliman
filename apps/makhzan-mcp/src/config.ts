/**
 * Configuration for the read-only MCP server.
 *
 * Every value that matters is required explicitly: there is no default network and no default
 * contract, so a tool can never answer about a chain the operator did not name. What is *not* here
 * is as important as what is: no private key, no signer, no write path. If a key variable is present
 * in the environment the server refuses to start and names the variable only, never its value.
 */
import { resolve } from "node:path";
import type { Hex } from "viem";

export const DEFAULT_BLOCK_SIZE = 1024;
export const MIN_BLOCK_SIZE = 1;
export const MAX_BLOCK_SIZE = 65_535;
/** Every attempt, not every tool call, is bounded by this; one retry follows a failure. */
export const DEFAULT_TIMEOUT_MS = 8_000;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Variables that hold a key or a seed. The server is read-only, so none of them has any use here;
 * their presence means the operator is pointing a wallet at a tool that must never have one.
 */
export const KEY_VARS = [
  "MAKHZAN_PRIVATE_KEY",
  "MAKHZAN_KEY",
  "MAKHZAN_MNEMONIC",
  "PRIVATE_KEY",
  "OWNER_KEY",
  "PROVIDER_1_KEY",
  "PROVIDER_2_KEY",
  "PAYER_KEY",
  "PAYEE_KEY",
  "DEPLOYER_KEY",
  "GATE_KEY",
  "MNEMONIC",
] as const;

export interface McpConfig {
  rpcUrl: string;
  chainId: number;
  contract: Hex;
  /** null means "no gate address was configured": the gate is not deployed as far as this server knows. */
  gate: Hex | null;
  blockSize: number;
  timeoutMs: number;
  /** The only folder `verify_file` may read; `MAKHZAN_VERIFY_DIR`, default the working directory. */
  verifyDir: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is required: this server has no default network`);
  return value;
}

function positiveInt(raw: string, name: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!/^\d+$/.test(raw)) throw new ConfigError(`${name} must be a positive integer, got "${raw}"`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got "${raw}"`);
  }
  if (value > max) throw new ConfigError(`${name} is out of range for a block size: at most ${max}, got ${value}`);
  return value;
}

export function loadConfig(env: Record<string, string | undefined>): McpConfig {
  for (const name of KEY_VARS) {
    if (env[name]?.trim()) {
      throw new ConfigError(
        `${name} is set, but this server is read-only and never loads a key. ` +
          `Unset ${name} and restart the server. (The value was not read.)`,
      );
    }
  }

  const rpcUrl = required(env, "MAKHZAN_RPC_URL");
  if (!/^https?:\/\//.test(rpcUrl)) {
    throw new ConfigError("MAKHZAN_RPC_URL must be an http(s) URL");
  }

  const chainId = positiveInt(required(env, "MAKHZAN_CHAIN_ID"), "MAKHZAN_CHAIN_ID", 2 ** 53 - 1);

  const contract = required(env, "MAKHZAN_CONTRACT");
  if (!ADDRESS.test(contract)) {
    throw new ConfigError("MAKHZAN_CONTRACT must be a 20 bytes hex address (0x + 40 hex digits)");
  }

  const gateRaw = env.MAKHZAN_GATE?.trim();
  if (gateRaw && !ADDRESS.test(gateRaw)) {
    throw new ConfigError("MAKHZAN_GATE must be a 20 bytes hex address (0x + 40 hex digits)");
  }

  const blockSize = env.MAKHZAN_BLOCK_SIZE
    ? positiveInt(env.MAKHZAN_BLOCK_SIZE, "MAKHZAN_BLOCK_SIZE (block size)", MAX_BLOCK_SIZE)
    : DEFAULT_BLOCK_SIZE;
  if (blockSize < MIN_BLOCK_SIZE) {
    throw new ConfigError(`block size must be in ${MIN_BLOCK_SIZE}..${MAX_BLOCK_SIZE}`);
  }

  const timeoutMs = env.MAKHZAN_RPC_TIMEOUT_MS
    ? positiveInt(env.MAKHZAN_RPC_TIMEOUT_MS, "MAKHZAN_RPC_TIMEOUT_MS")
    : DEFAULT_TIMEOUT_MS;

  // An empty value means "not set", so a blank line in a config file cannot widen the scope to "/".
  const verifyDir = env.MAKHZAN_VERIFY_DIR?.trim()
    ? resolve(env.MAKHZAN_VERIFY_DIR.trim())
    : process.cwd();

  return {
    rpcUrl,
    chainId,
    contract: contract as Hex,
    gate: (gateRaw ? gateRaw : null) as Hex | null,
    blockSize,
    timeoutMs,
    verifyDir,
  };
}
