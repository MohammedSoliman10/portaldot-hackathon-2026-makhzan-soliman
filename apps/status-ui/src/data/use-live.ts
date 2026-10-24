import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keccak256 } from "viem";
import type { ModeState } from "../config/modes";
import { checkChain, createReadClient, runRead, type ReadClient } from "./client";
import { codeOf, peekConfig } from "./reads";
import type { PeekConfig } from "./peek";
import type { Hex } from "./schema";

export interface LiveOptions {
  client?: ReadClient;
  now?: () => number;
  staleAfterMs?: number;
  intervalMs?: number;
}

export interface LiveDeployment {
  status: "off" | "checking" | "live" | "blocked" | "error";
  config: PeekConfig | null;
  block: number | null;
  at: string | null;
  codeHash: Hex | null;
  codeBytes: number | null;
  stale: boolean;
  error: string | null;
  blockingDetail: string | null;
  refresh: () => void;
}

const INITIAL: Omit<LiveDeployment, "refresh"> = {
  status: "checking",
  config: null,
  block: null,
  at: null,
  codeHash: null,
  codeBytes: null,
  stale: false,
  error: null,
  blockingDetail: null,
};

/**
 * The live overlay for one deployment: chain guard first, then config and runtime code, refreshed
 * every 30 s. A failed read keeps the last good value and marks it STALE; it never empties the page.
 */
export function useLiveDeployment(mode: ModeState, options: LiveOptions = {}): LiveDeployment {
  const nowRef = useRef(options.now ?? (() => Date.now()));
  const now = nowRef.current;
  const staleAfterMs = options.staleAfterMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 30_000;
  const client = useMemo(() => options.client ?? createReadClient(mode), [options.client, mode]);
  const [state, setState] = useState<Omit<LiveDeployment, "refresh">>(
    client ? INITIAL : { ...INITIAL, status: "off" },
  );
  const [tick, setTick] = useState(0);
  const lastGood = useRef<number | null>(null);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!client) return;
    const active = client;
    let cancelled = false;
    const controller = new AbortController();

    async function run(): Promise<void> {
      setState((previous) => ({
        ...previous,
        status: previous.status === "live" ? "live" : "checking",
      }));

      const chain = await checkChain(active, mode.expectedChainId);
      if (cancelled) return;
      if (!chain.ok) {
        setState((previous) => ({
          ...previous,
          status: "blocked",
          blockingDetail: chain.message,
        }));
        return;
      }

      const [config, code, blockNumber] = await Promise.all([
        peekConfig(active, mode.address!),
        codeOf(active, mode.address!),
        runRead(() => active.getBlockNumber(), { signal: controller.signal }),
      ]);
      if (cancelled) return;

      if (config.value === null) {
        const age = lastGood.current === null ? Number.POSITIVE_INFINITY : now() - lastGood.current;
        setState((previous) => ({
          ...previous,
          status: "error",
          stale: age > staleAfterMs,
          error: config.error?.message ?? "the config read failed",
        }));
        return;
      }

      const runtime = code.value ?? null;
      lastGood.current = now();
      setState({
        status: "live",
        config: config.value,
        block: blockNumber.value === null ? null : Number(blockNumber.value),
        at: config.at,
        codeHash: runtime ? keccak256(runtime) : null,
        codeBytes: runtime ? (runtime.length - 2) / 2 : null,
        stale: false,
        error: null,
        blockingDetail: null,
      });
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, tick, mode.address, mode.expectedChainId, staleAfterMs]);

  useEffect(() => {
    if (!client) return;
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [client, intervalMs, refresh]);

  return { ...state, refresh };
}
