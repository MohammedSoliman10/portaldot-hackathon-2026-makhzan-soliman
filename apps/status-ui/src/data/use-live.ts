import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keccak256 } from "viem";
import type { ModeState } from "../config/modes";
import { checkChain, createReadClient, runRead, type ReadClient } from "./client";
import { balanceOf, codeOf, dealOf, healthOf, peekConfig, providerOf, type DealRead, type ProviderView } from "./reads";
import type { PeekConfig } from "./peek";
import type { Hex } from "./schema";

export interface LiveOptions {
  client?: ReadClient;
  now?: () => number;
  staleAfterMs?: number;
  intervalMs?: number;
  /** Provider whose bond is shown; normally the one recorded in the evidence. */
  providerAddress?: Hex | null;
  /** Deals to read back; normally the ids recorded in the evidence. */
  dealIds?: readonly number[];
}

export interface LiveDeployment {
  status: "off" | "checking" | "live" | "blocked" | "error";
  config: PeekConfig | null;
  block: number | null;
  at: string | null;
  codeHash: Hex | null;
  codeBytes: number | null;
  provider: ProviderView | null;
  deals: Record<number, DealRead | null>;
  health: Record<number, number | null>;
  balanceWei: string | null;
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
  provider: null,
  deals: {},
  health: {},
  balanceWei: null,
  stale: false,
  error: null,
  blockingDetail: null,
};

/**
 * The live overlay for one deployment: chain guard first, then config, runtime code, the provider
 * bond, the recorded deals and the contract balance, refreshed every 30 s. A failed read keeps the
 * last good value and marks it STALE; it never empties the page.
 */
export function useLiveDeployment(mode: ModeState, options: LiveOptions = {}): LiveDeployment {
  const nowRef = useRef(options.now ?? (() => Date.now()));
  const now = nowRef.current;
  const staleAfterMs = options.staleAfterMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 30_000;
  const providerAddress = options.providerAddress ?? null;
  const dealIdsKey = (options.dealIds ?? []).join(",");
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
    const ids = [...new Set(dealIdsKey === "" ? [] : dealIdsKey.split(",").map(Number))].sort((a, b) => a - b);

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

      const address = mode.address!;
      const [config, code, blockNumber, balance, provider] = await Promise.all([
        peekConfig(active, address),
        codeOf(active, address),
        runRead(() => active.getBlockNumber(), { signal: controller.signal }),
        balanceOf(active, address),
        providerAddress ? providerOf(active, address, providerAddress) : Promise.resolve(null),
      ]);
      const [dealReads, healthReads] = await Promise.all([
        Promise.all(ids.map((id) => dealOf(active, address, id))),
        Promise.all(ids.map((id) => healthOf(active, address, id))),
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

      const deals = ids.map((id, position) => ({ id, deal: dealReads[position] }));
      const health = ids.map((id, position) => ({ id, health: healthReads[position] }));
      const runtime = code.value ?? null;
      lastGood.current = now();

      setState((previous) => {
        const nextDeals = { ...previous.deals };
        for (const entry of deals) {
          if (entry.deal) nextDeals[entry.id] = entry.deal.value;
        }
        const nextHealth = { ...previous.health };
        for (const entry of health) {
          if (entry.health) nextHealth[entry.id] = entry.health.value;
        }
        return {
          status: "live",
          config: config.value,
          block: blockNumber.value === null ? null : Number(blockNumber.value),
          at: config.at,
          codeHash: runtime ? keccak256(runtime) : previous.codeHash,
          codeBytes: runtime ? (runtime.length - 2) / 2 : previous.codeBytes,
          provider: provider?.value ?? previous.provider,
          deals: nextDeals,
          health: nextHealth,
          balanceWei: balance.value ?? previous.balanceWei,
          stale: false,
          error: null,
          blockingDetail: null,
        };
      });
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, tick, mode.address, mode.expectedChainId, staleAfterMs, providerAddress, dealIdsKey, now]);

  useEffect(() => {
    if (!client) return;
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [client, intervalMs, refresh]);

  return { ...state, refresh };
}
