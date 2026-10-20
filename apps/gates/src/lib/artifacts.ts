import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Abi, Hex } from "viem";
import { REPO_ROOT } from "../config.ts";

export const CONTRACTS_DIR = join(REPO_ROOT, "contracts");

export interface Artifact {
  abi: Abi;
  bytecode: { object: Hex };
  deployedBytecode: { object: Hex };
  metadata: {
    compiler: { version: string };
    settings: { evmVersion: string; optimizer: { enabled: boolean; runs: number } };
  };
}

let built = false;

/** Compile once per process and return the build log. */
export function forgeBuild(): string {
  if (built) return "";
  const output = execFileSync("forge", ["build", "--force"], { cwd: CONTRACTS_DIR, encoding: "utf8" });
  built = true;
  return output;
}

export async function loadArtifact(contractName: string): Promise<Artifact> {
  forgeBuild();
  const path = join(CONTRACTS_DIR, "out", `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(await readFile(path, "utf8")) as Artifact;
}
