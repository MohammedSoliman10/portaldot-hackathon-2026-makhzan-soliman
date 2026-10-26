import { createPublicClient, defineChain, http } from "viem";
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

/** The narrow surface the read layer uses. A viem public client satisfies it; a test double can too. */
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
  getBalance(args: { address: Hex }): Promise<bigint>;
  getBlock(args?: { blockNumber?: bigint }): Promise<{ timestamp: bigint } | null>;
}

/** 4 s timeout, two retries with backoff — the envelope in `research.md` D-09. */
export const TRANSPORT = { timeout: 4000, retryCount: 2, retryDelay: 300 } as const;

const measured = <T>(value: T, at: string, block: number | null): ReadResult<T> => ({
  value,
  block,
  at,
  label: "MEASURED",
  stale: false,
  error: null,
});

const failed = <T>(error: ReadError): ReadResult<T> => ({
  value: null,
  block: null,
  at: null,
  label: "MEASURED",
  stale: false,
  error,
});

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get open(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.openedAt = null;
      this.failures = 0;
      return false;
    }
    return true;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }
}

/**
 * A public client only: no account, no wallet, no write action. `RECORDED` returns null, which is the
 * code-level proof that a recorded build never opens a socket.
 */
export function createReadClient(mode: ModeState): ReadClient | null {
  if (!mode.clientEnabled || !mode.address || !mode.rpcUrl) return null;
  const chain = defineChain({
    id: mode.expectedChainId,
    name: "makhzan-read",
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [mode.rpcUrl] } },
  });
  return createPublicClient({
    chain,
    transport: http(mode.rpcUrl, TRANSPORT),
  }) as unknown as ReadClient;
}

export interface RunReadOptions {
  breaker?: CircuitBreaker;
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => number;
  block?: number;
}

/** Runs one read under a timeout, an abort path and the circuit breaker. It never throws. */
export async function runRead<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RunReadOptions = {},
): Promise<ReadResult<T>> {
  const now = options.now ?? (() => Date.now());
  if (options.breaker?.open) {
    return failed({ kind: "rpc", message: "circuit open: three consecutive reads failed; retry shortly" });
  }

  const timeoutMs = options.timeoutMs ?? TRANSPORT.timeout;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort);

  try {
    const value = await fn(controller.signal);
    options.breaker?.recordSuccess();
    return measured(value, new Date(now()).toISOString(), options.block ?? null);
  } catch (error) {
    options.breaker?.recordFailure();
    const message = error instanceof Error ? error.message : String(error);
    if (timedOut) return failed({ kind: "timeout", message: `read timed out after ${timeoutMs} ms` });
    if (controller.signal.aborted) return failed({ kind: "rpc", message: "aborted by unmount" });
    if (/revert/i.test(message)) return failed({ kind: "reverted", message });
    return failed({ kind: "rpc", message });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Reads the node's chain id before any other call. A mismatch pauses live reads and names both ids;
 * it never replaces the recorded page.
 */
export async function checkChain(
  client: ReadClient,
  expectedChainId: number,
): Promise<{ ok: boolean; observed: number | null; message: string }> {
  return runRead(() => client.getChainId()).then((result) => {
    if (result.value === null) {
      return {
        ok: false,
        observed: null,
        message: `CHAIN MISMATCH — the node did not answer eth_chainId (${result.error?.message ?? "unknown"}); live reads paused.`,
      };
    }
    const observed = result.value;
    if (observed !== expectedChainId) {
      return {
        ok: false,
        observed,
        message: `CHAIN MISMATCH — expected ${expectedChainId}, node reports ${observed}. Live reads paused.`,
      };
    }
    return { ok: true, observed, message: `chain ${observed} confirmed` };
  });
}
