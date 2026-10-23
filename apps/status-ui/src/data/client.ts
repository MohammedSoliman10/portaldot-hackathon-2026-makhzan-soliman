import type { ModeState } from "../config/modes";
import type { Hex } from "./schema";

export interface ReadError {
  kind: "timeout" | "rpc" | "chain-mismatch" | "reverted" | "malformed";
  message: string;
}

export interface ReadResult<T> {
  value: T | null;
  block: number | null;
  at: string | null;
  label: "MEASURED";
  stale: boolean;
  error: ReadError | null;
}

export interface ReadClient {
  readContract(args: {
    address: Hex;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  getChainId(): Promise<number>;
  getCode(args: { address: Hex }): Promise<Hex | undefined>;
  getBlockNumber(): Promise<bigint>;
  getBlock(args?: { blockNumber?: bigint }): Promise<{ timestamp: bigint } | null>;
}

export const TRANSPORT = { timeout: 4000, retryCount: 2, retryDelay: 300 } as const;

export class CircuitBreaker {
  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
  ) {}

  get open(): boolean {
    return false;
  }

  recordFailure(): void {}

  recordSuccess(): void {}
}

export function createReadClient(_mode: ModeState): ReadClient | null {
  throw new Error("not implemented");
}

export async function runRead<T>(
  _fn: (signal: AbortSignal) => Promise<T>,
  _options: { breaker?: CircuitBreaker; signal?: AbortSignal; timeoutMs?: number; now?: () => number; block?: number } = {},
): Promise<ReadResult<T>> {
  throw new Error("not implemented");
}

export async function checkChain(
  _client: ReadClient,
  _expectedChainId: number,
): Promise<{ ok: boolean; observed: number | null; message: string }> {
  throw new Error("not implemented");
}
