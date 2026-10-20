import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { CONTRACTS_DIR } from "./artifacts.ts";

const PVM_MAGIC = "50564d00";
const cache = new Map<string, PvmArtifact>();

export interface PvmArtifact {
  contract: string;
  hex: string;
  bytes: number;
  sha256: string;
  resolcVersion: string;
  solc: string;
  command: string;
}

export function isPvmBlob(value: string): boolean {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) return false;
  if (value.length % 2 !== 0) return false;
  return value.slice(2, 10).toLowerCase() === PVM_MAGIC;
}

export function pvmBlobHex(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function resolcBinary(): string {
  return process.env.RESOLC_PATH ?? join(homedir(), ".local", "bin", "resolc");
}

function solcBinary(): string {
  return process.env.SOLC_PATH ?? join(homedir(), ".svm", "0.8.28", "solc-0.8.28");
}

/** Compile one tier-0 probe with resolc into a PVM blob. The result is cached per process. */
export async function compilePvm(contract: string): Promise<PvmArtifact> {
  const cached = cache.get(contract);
  if (cached) return cached;

  const resolc = resolcBinary();
  const solc = solcBinary();
  const out = await mkdtemp(join(tmpdir(), "makhzan-resolc-"));
  const version = execFileSync(resolc, ["--version"], { encoding: "utf8" }).trim();
  const args = [
    join(CONTRACTS_DIR, "src", "tier0", `${contract}.sol`),
    "--bin",
    "--output-dir",
    out,
    "-O3",
    "--base-path",
    CONTRACTS_DIR,
    "--solc",
    solc,
    "--overwrite",
  ];
  execFileSync(resolc, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const bytes = await readFile(join(out, `${contract}.sol:${contract}.pvm`));
  const hex = pvmBlobHex(bytes);
  if (!isPvmBlob(hex)) throw new Error(`resolc output for ${contract} is not a PVM blob`);
  const artifact: PvmArtifact = {
    contract,
    hex,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    resolcVersion: version,
    solc,
    command: `resolc ${args.join(" ")}`,
  };
  cache.set(contract, artifact);
  return artifact;
}
