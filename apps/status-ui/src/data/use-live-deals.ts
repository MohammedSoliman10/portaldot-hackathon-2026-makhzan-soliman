import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModeState } from "../config/modes";
import { createReadClient, type ReadClient, runRead } from "./client";
import { dealOf, healthOf, peekConfig } from "./reads";
import type { Hex } from "./schema";

export interface LiveDealRow {
  id: number;
  owner: Hex;
  providerId: number;
  priceUnits: string;
  startBlock: number;
  endBlock: number;
  blocksLeft: number;
  flags: number;
  health: number;
  healthLabel: "healthy" | "challenge open" | "in default" | "settled or none" | "term ended, not settled";
}

export interface LiveDealsCounts {
  created: number;
  settled: number;
  healthyNow: number;
}

export interface LiveDealsState {
  status: "idle" | "loading" | "live" | "error";
  deals: LiveDealRow[];
  counts: LiveDealsCounts;
  error: string | null;
  retry: () => void;
}

export interface LiveDealsOptions {
  client?: ReadClient;
  nextDealId?: number | null;
  block?: number | null;
}

const CACHE_KEY_PREFIX = "makhzan_live_deals_v1";

export function formatDealHealth(
  health: number,
  endBlock: number,
  currentBlock: number | null,
): "healthy" | "challenge open" | "in default" | "settled or none" | "term ended, not settled" {
  if (health === 0) return "settled or none";
  if (health === 2) return "challenge open";
  if (health === 3) return "in default";
  if (health === 1) {
    if (currentBlock !== null && currentBlock >= endBlock) {
      return "term ended, not settled";
    }
    return "healthy";
  }
  return "settled or none";
}

function loadSessionDeals(chainId: number, address: string | null): LiveDealRow[] | null {
  if (!address || typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(`${CACHE_KEY_PREFIX}:${chainId}:${address.toLowerCase()}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as LiveDealRow[];
    }
  } catch {
    // ignore
  }
  return null;
}

function saveSessionDeals(chainId: number, address: string | null, deals: LiveDealRow[]): void {
  if (!address || typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(`${CACHE_KEY_PREFIX}:${chainId}:${address.toLowerCase()}`, JSON.stringify(deals));
  } catch {
    // ignore
  }
}

function deriveCounts(deals: LiveDealRow[], nextDealId: number | null): LiveDealsCounts {
  const created = nextDealId !== null && nextDealId > 0 ? nextDealId - 1 : deals.length;
  const settled = deals.filter((d) => d.health === 0).length;
  const healthyNow = deals.filter((d) => d.healthLabel === "healthy").length;
  return { created, settled, healthyNow };
}

export function useLiveDeals(mode: ModeState, options: LiveDealsOptions = {}): LiveDealsState {
  const client = useMemo(() => options.client ?? createReadClient(mode), [options.client, mode]);
  const address = mode.address ?? null;
  const chainId = mode.expectedChainId;

  const [cachedDeals] = useState<LiveDealRow[] | null>(() => loadSessionDeals(chainId, address));
  const [deals, setDeals] = useState<LiveDealRow[]>(() => cachedDeals ?? []);
  const [counts, setCounts] = useState<LiveDealsCounts>(() =>
    deriveCounts(cachedDeals ?? [], options.nextDealId ?? null),
  );
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">(
    cachedDeals ? "live" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setRetryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!client || !address || !mode.clientEnabled) {
      return;
    }

    let cancelled = false;

    async function fetchLiveDeals() {
      setStatus("loading");
      setError(null);

      try {
        let nextDealId = options.nextDealId ?? null;
        let currentBlock = options.block ?? null;

        // If nextDealId or block not supplied, read them
        if (nextDealId === null || currentBlock === null) {
          const [cfg, blk] = await Promise.all([
            nextDealId === null ? peekConfig(client!, address!) : Promise.resolve(null),
            currentBlock === null
              ? runRead(() => client!.getBlockNumber())
              : Promise.resolve(null),
          ]);
          if (cancelled) return;
          if (cfg?.value?.nextDealId) {
            nextDealId = cfg.value.nextDealId;
          }
          if (blk?.value !== null && blk?.value !== undefined) {
            currentBlock = Number(blk.value);
          }
        }

        if (nextDealId === null) {
          throw new Error("Unable to read nextDealId from contract");
        }

        const totalDeals = Math.max(0, nextDealId - 1);
        if (totalDeals === 0) {
          if (cancelled) return;
          setDeals([]);
          setCounts({ created: 0, settled: 0, healthyNow: 0 });
          setStatus("live");
          saveSessionDeals(chainId, address, []);
          return;
        }

        // Latest 20 deals, in ascending order: from max(1, totalDeals - 19) to totalDeals
        const count = Math.min(totalDeals, 20);
        const startId = totalDeals - count + 1;
        const dealIds = Array.from({ length: count }, (_, i) => startId + i);

        const dealResults = await Promise.all(
          dealIds.map(async (id) => {
            const [dealRes, healthRes] = await Promise.all([
              dealOf(client!, address!, id),
              healthOf(client!, address!, id),
            ]);

            if (!dealRes || dealRes.value === null) {
              throw new Error(`Failed to read deal ${id}: ${dealRes?.error?.message ?? "unknown error"}`);
            }
            if (!healthRes || healthRes.value === null) {
              throw new Error(`Failed to read health of deal ${id}: ${healthRes?.error?.message ?? "unknown error"}`);
            }

            const d = dealRes.value;
            const h = healthRes.value;
            const endBlock = d.endBlock;
            const blocksLeft =
              currentBlock !== null && currentBlock < endBlock ? endBlock - currentBlock : 0;
            const healthLabel = formatDealHealth(h, endBlock, currentBlock);

            const row: LiveDealRow = {
              id,
              owner: d.owner,
              providerId: d.providerId,
              priceUnits: d.priceUnits,
              startBlock: d.startBlock,
              endBlock: d.endBlock,
              blocksLeft,
              flags: d.flags,
              health: h,
              healthLabel,
            };
            return row;
          }),
        );

        if (cancelled) return;

        setDeals(dealResults);
        const newCounts = deriveCounts(dealResults, nextDealId);
        setCounts(newCounts);
        setStatus("live");
        saveSessionDeals(chainId, address, dealResults);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
      }
    }

    void fetchLiveDeals();

    return () => {
      cancelled = true;
    };
  }, [client, address, chainId, mode.clientEnabled, options.nextDealId, options.block, retryTick]);

  return {
    status,
    deals,
    counts,
    error,
    retry,
  };
}
