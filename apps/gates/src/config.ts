import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/** Repository root, derived from this module's own location, never from cwd. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const EVIDENCE_DIR = join(REPO_ROOT, "evidence");
export const GATES_DIR = join(EVIDENCE_DIR, "gates");
export const RAW_DIR = join(EVIDENCE_DIR, "raw");
export const RPC_LOG_DIR = join(EVIDENCE_DIR, "rpc-log");
export const ENV_FILE = join(REPO_ROOT, ".env");

export const CHAIN = {
  id: 420420777,
  name: "Portaldot Testnet V3",
  nativeCurrency: { name: "tPOTv3", symbol: "tPOT", decimals: 14 },
} as const;

export type BurnerRole =
  | "provider-1"
  | "provider-2"
  | "provider-3"
  | "provider-4"
  | "vault-agent"
  | "owner";

export interface BurnerSpec {
  readonly role: BurnerRole;
  readonly envName: string;
}

export const BURNERS: readonly BurnerSpec[] = [
  { role: "provider-1", envName: "PROVIDER_1_KEY" },
  { role: "provider-2", envName: "PROVIDER_2_KEY" },
  { role: "provider-3", envName: "PROVIDER_3_KEY" },
  { role: "provider-4", envName: "PROVIDER_4_KEY" },
  { role: "vault-agent", envName: "VAULT_AGENT_KEY" },
  { role: "owner", envName: "OWNER_KEY" },
];

const FORBIDDEN_FLAGS = ["--private-key", "--mnemonic", "--seed"];

/** Refuse any key material passed on the command line, before anything runs. */
export function assertNoKeyOnArgv(argv: readonly string[] = process.argv): void {
  for (const arg of argv) {
    if (FORBIDDEN_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`))) {
      console.error("REFUSED: keys are never accepted as arguments; use environment variables.");
      process.exit(4);
    }
  }
}

/** Load the repo-root .env if it exists. Values already in the environment win. */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

export interface RuntimeConfig {
  readonly evmRpcUrl: string;
  readonly wsUrl: string;
  readonly explorerUrl: string | null;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(): RuntimeConfig {
  assertNoKeyOnArgv();
  loadEnvFile();
  return {
    evmRpcUrl: requireEnv("PORTALDOT_EVM_RPC_URL"),
    wsUrl: requireEnv("PORTALDOT_WS_URL"),
    explorerUrl: process.env.PORTALDOT_EXPLORER_URL || null,
  };
}

/** Read a burner key without ever returning it to a logging path. */
export function getBurnerKey(role: BurnerRole): string {
  const spec = BURNERS.find((burner) => burner.role === role);
  if (!spec) throw new Error(`unknown burner role ${role}`);
  const value = process.env[spec.envName];
  if (!value || value.trim() === "") {
    throw new Error(`missing required environment variable ${spec.envName}`);
  }
  return value.trim();
}

/** Loaded secret values, used by the sanitizer. Never printed. */
export function loadedSecrets(): string[] {
  return BURNERS.map((burner) => process.env[burner.envName])
    .filter((value): value is string => Boolean(value) && value!.length >= 32)
    .map((value) => value!.trim());
}

export function gateRecordPath(gateId: string): string {
  return join(GATES_DIR, `${gateId.toLowerCase()}.json`);
}

export function gateRawDir(gateId: string): string {
  return join(RAW_DIR, gateId.toLowerCase());
}
