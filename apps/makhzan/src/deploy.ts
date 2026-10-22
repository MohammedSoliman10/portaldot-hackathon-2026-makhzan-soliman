/** Stub with the documented exports: the red run must fail on behaviour, not on resolution. */
import type { Abi, Hex } from "viem";

export const WEI_PER_UNIT = 10_000n;
export const UINT64_MAX = 2n ** 64n - 1n;
export const LOCAL_CHAIN_ID = 420_420_777;
export const LOCAL_RPC = "http://127.0.0.1:8549";
export const DEFAULT_MIN_BOND_WEI = 100_000_000_000_000_000_000n;
export const DEFAULT_RESERVE_TPOT = 500n;

export class DeployError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployError";
  }
}

export interface DeploySettings { network: "local" | "live"; rpcUrl: string; chainId: number; privateKey: Hex }
export interface DeployArgs {
  dryRun: boolean; artifact: string; out?: string; minBondWei: bigint; challengeWindow: number;
  challengeBlockSize: number; slashBps: number; minDurationBlocks: number; maxDurationBlocks: number;
  reserveTpot: bigint;
}
export interface DeploymentRecord { [key: string]: unknown }
export interface Artifact { abi: Abi; bytecode: Hex; runtimeBytes: number }
export interface RunResult { record?: DeploymentRecord; estimateTpot?: string }

function notImplemented(): never {
  throw new Error("not implemented");
}

export function repoPath(_path: string): string { return notImplemented(); }
export function deploySettings(_env: NodeJS.ProcessEnv): DeploySettings { return notImplemented(); }
export function parseDeployArgs(_argv: string[], _env?: NodeJS.ProcessEnv): DeployArgs { return notImplemented(); }
export function loadArtifact(_path: string): Artifact { return notImplemented(); }
export function formatTpot(_wei: bigint): string { return notImplemented(); }
export function decodeConfig(_slot0: Hex): {
  challengeWindow: number; challengeBlockSize: number; slashBps: number; minBond: bigint;
  nextDealId: number; providerCount: number; minDurationBlocks: number; maxDurationBlocks: number;
} { return notImplemented(); }
export async function runDeploy(_args: DeployArgs, _settings: DeploySettings, _log: (line: string) => void): Promise<RunResult> { return notImplemented(); }
export async function main(_argv: string[], _env: NodeJS.ProcessEnv, _log: (line: string) => void): Promise<number> { return notImplemented(); }
