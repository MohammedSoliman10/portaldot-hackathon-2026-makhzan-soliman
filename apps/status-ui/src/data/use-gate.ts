import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModeState } from "../config/modes";
import type { Hex } from "./schema";
import { checkChain, createReadClient, runRead, type ReadClient } from "./client";
import { effectiveBondUnits, lockOf, type LockRead } from "./gate";
import { codeOf, dealOf, healthOf, providerOf, type ProviderView } from "./reads";

export interface GateLive {
  status: "off" | "checking" | "live" | "blocked" | "error" | "no-code";
  block: number | null;
  at: string | null;
  lock: LockRead | null;
  health: number | null;
  endBlock: number | null;
  dealProviderId: number | null;
  provider: ProviderView | null;
  /** The bond the gate would compare with `minBond`, after the provider-id check. */
  bondUnits: string | null;
  error: string | null;
  blockingDetail: string | null;
  refresh: () => void;
}

const INITIAL: Omit<GateLive, "refresh"> = {
  status: "checking",
  block: null,
  at: null,
  lock: null,
  health: null,
  endBlock: null,
  dealProviderId: null,
  provider: null,
  bondUnits: null,
  error: null,
  blockingDetail: null,
};

/**
 * One deal at the gate, read live: the lock, the deal's health, the term and the payee's bond. No
 * write function exists in the ABIs it uses, so nothing here can release or refund anything.
 */
export function useGate(
  mode: ModeState,
  dealId: number,
  options: { client?: ReadClient; now?: () => number } = {},
): GateLive {
  const client = useMemo(() => options.client ?? createReadClient(mode), [options.client, mode]);
  const nowRef = useRef(options.now ?? (() => Date.now()));
  const now = nowRef.current;
  const [state, setState] = useState<Omit<GateLive, "refresh">>(
    client ? INITIAL : { ...INITIAL, status: "off" },
  );
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!client) return;
    const active = client;
    const gate = mode.gateAddress;
    const makhzan = mode.address;
    if (!gate || !makhzan) {
      setState({ ...INITIAL, status: "off" });
      return;
    }
    const gateAddress: Hex = gate;
    const makhzanAddress: Hex = makhzan;
    let cancelled = false;

    async function run(): Promise<void> {
      setState((previous) => ({ ...previous, status: "checking" }));
      const chain = await checkChain(active, mode.expectedChainId);
      if (cancelled) return;
      if (!chain.ok) {
        setState({ ...INITIAL, status: "blocked", blockingDetail: chain.message });
        return;
      }

      const code = await codeOf(active, gateAddress);
      if (cancelled) return;
      if (code.value === "0x") {
        setState({ ...INITIAL, status: "no-code" });
        return;
      }

      const [block, lock] = await Promise.all([
        runRead(() => active.getBlockNumber()),
        lockOf(active, gateAddress, dealId),
      ]);
      if (cancelled) return;
      if (lock.value === null) {
        setState({ ...INITIAL, status: "error", error: lock.error?.message ?? "the lock read failed" });
        return;
      }

      const [health, deal, provider] = await Promise.all([
        healthOf(active, makhzanAddress, dealId),
        dealOf(active, makhzanAddress, dealId),
        providerOf(active, makhzanAddress, lock.value.payee),
      ]);
      if (cancelled) return;

      setState({
        status: "live",
        block: block.value === null ? null : Number(block.value),
        at: new Date(now()).toISOString(),
        lock: lock.value,
        health: health.value,
        endBlock: deal.value?.endBlock ?? null,
        dealProviderId: deal.value?.providerId ?? null,
        provider: provider.value,
        bondUnits: effectiveBondUnits(provider.value, deal.value?.providerId ?? null),
        error: null,
        blockingDetail: null,
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [client, mode, dealId, tick]);

  return { ...state, refresh };
}
