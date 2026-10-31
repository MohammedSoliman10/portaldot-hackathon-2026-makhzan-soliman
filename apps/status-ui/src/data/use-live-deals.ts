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

interface CachedData {
  deals: LiveDealRow[];
  counts: LiveDealsCounts;
}

function loadSessionDeals(chainId: number, address: string | null): CachedData | null {
  if (!address || typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(`${CACHE_KEY_PREFIX}:${chainId}:${address.toLowerCase()}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return {
          deals: parsed as LiveDealRow[],
          counts: deriveCounts(parsed as LiveDealRow[], parsed.length),
        };
      }
      if (parsed && Array.isArray(parsed.deals) && parsed.counts) {
        return parsed as CachedData;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveSessionDeals(
  chainId: number,
  address: string | null,
  deals: LiveDealRow[],
  counts: LiveDealsCounts,
): void {
  if (!address || typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      `${CACHE_KEY_PREFIX}:${chainId}:${address.toLowerCase()}`,
      JSON.stringify({ deals, counts }),
    );
  } catch {
    // ignore
  }
}

function deriveCounts(deals: LiveDealRow[], nextDealId: number | null): LiveDealsCounts {
  const created = nextDealId !== null ? Math.max(0, nextDealId) : deals.length;
  const settled = deals.filter((d) => d.health === 0).length;
  const healthyNow = deals.filter((d) => d.healthLabel === "healthy").length;
  return { created, settled, healthyNow };
}

export function useLiveDeals(mode: ModeState, options: LiveDealsOptions = {}): LiveDealsState {
  const client = useMemo(() => options.client ?? createReadClient(mode), [options.client, mode]);
  const address = mode.address ?? null;
  const chainId = mode.expectedChainId;

  const [cachedData] = useState<CachedData | null>(() => loadSessionDeals(chainId, address));
  const [deals, setDeals] = useState<LiveDealRow[]>(() => cachedData?.deals ?? []);
  const [counts, setCounts] = useState<LiveDealsCounts>(() =>
    cachedData?.counts ?? deriveCounts([], options.nextDealId ?? null),
  );
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">(
    cachedData ? "live" : "idle",
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
          if (cfg?.value?.nextDealId !== undefined && cfg?.value?.nextDealId !== null) {
            nextDealId = cfg.value.nextDealId;
          }
          if (blk?.value !== null && blk?.value !== undefined) {
            currentBlock = Number(blk.value);
          }
        }

        if (nextDealId === null) {
          throw new Error("Unable to read nextDealId from contract");
        }

        const totalDeals = Math.max(0, nextDealId);
        if (totalDeals === 0) {
          if (cancelled) return;
          const zeroCounts: LiveDealsCounts = { created: 0, settled: 0, healthyNow: 0 };
          setDeals([]);
          setCounts(zeroCounts);
          setStatus("live");
          saveSessionDeals(chainId, address, [], zeroCounts);
          return;
        }

        // All deal IDs 1..totalDeals for full settled and health coverage
        const allIds = Array.from({ length: totalDeals }, (_, i) => i + 1);

        // Fetch healthOf for every deal to compute settled and healthyNow accurately
        const allHealth = await Promise.all(
          allIds.map((id) => healthOf(client!, address!, id)),
        );

        // Latest 20 deals, ordered descending from totalDeals down to max(1, totalDeals - 19)
        const count = Math.min(totalDeals, 20);
        const dealIds = Array.from({ length: count }, (_, i) => totalDeals - i);

        // Fetch dealOf for the latest 20 deals to display in the table
        const latestDealDetails = await Promise.all(
          dealIds.map((id) => dealOf(client!, address!, id)),
        );

        // Verify reads on latest deals
        for (let i = 0; i < dealIds.length; i++) {
          const id = dealIds[i]!;
          const dealRes = latestDealDetails[i];
          const healthRes = allHealth[id - 1];
          if (!dealRes || dealRes.value === null) {
            throw new Error(`Failed to read deal ${id}: ${dealRes?.error?.message ?? "unknown error"}`);
          }
          if (!healthRes || healthRes.value === null) {
            throw new Error(`Failed to read health of deal ${id}: ${healthRes?.error?.message ?? "unknown error"}`);
          }
        }

        const dealResults: LiveDealRow[] = dealIds.map((id, index) => {
          const d = latestDealDetails[index]!.value!;
          const h = allHealth[id - 1]!.value!;
          const endBlock = d.endBlock;
          const blocksLeft =
            currentBlock !== null && currentBlock < endBlock ? endBlock - currentBlock : 0;
          const healthLabel = formatDealHealth(h, endBlock, currentBlock);

          return {
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
        });

        // Settled count covers EVERY deal 1..totalDeals (where healthOf == 0)
        const settled = allHealth.filter((h) => h?.value === 0).length;

        // Healthy now: deals where health === 1 and (currentBlock === null || currentBlock < endBlock)
        const latestHealthy = dealResults.filter((d) => d.healthLabel === "healthy").length;

        // For any older deals (outside latest 20) with healthOf == 1, fetch endBlock to check if active
        const olderUnsettledCandidateIds = allIds
          .slice(0, Math.max(0, totalDeals - 20))
          .filter((id) => allHealth[id - 1]?.value === 1);

        let olderHealthy = 0;
        if (olderUnsettledCandidateIds.length > 0) {
          const olderDeals = await Promise.all(
            olderUnsettledCandidateIds.map((id) => dealOf(client!, address!, id)),
          );
          for (const res of olderDeals) {
            if (res?.value && (currentBlock === null || currentBlock < res.value.endBlock)) {
              olderHealthy++;
            }
          }
        }

        const healthyNow = latestHealthy + olderHealthy;

        if (cancelled) return;

        const newCounts: LiveDealsCounts = {
          created: totalDeals,
          settled,
          healthyNow,
        };

        setDeals(dealResults);
        setCounts(newCounts);
        setStatus("live");
        saveSessionDeals(chainId, address, dealResults, newCounts);
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
