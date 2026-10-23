/**
 * Refusal evidence: eth_call dry runs of actions the contract must refuse. Each revert is decoded to an
 * IMakhzan custom error and written to evidence/refusals.json with the network label. Read-only: an
 * eth_call never sends a transaction and no key is needed.
 */
import { decodeErrorResult, type Hex } from "viem";

export const ERROR_ABI = [
  { type: "error", name: "NotRegistered", inputs: [] },
  { type: "error", name: "AlreadyRegistered", inputs: [] },
  { type: "error", name: "BondTooSmall", inputs: [] },
  { type: "error", name: "HasOpenDeal", inputs: [] },
  { type: "error", name: "NoDeal", inputs: [] },
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "NotProvider", inputs: [] },
  { type: "error", name: "BadParams", inputs: [] },
  { type: "error", name: "DealExpired", inputs: [] },
  { type: "error", name: "ChallengeOpen", inputs: [] },
  { type: "error", name: "NoChallenge", inputs: [] },
  { type: "error", name: "ProofRejected", inputs: [] },
  { type: "error", name: "WindowOpen", inputs: [] },
  { type: "error", name: "ZeroClaim", inputs: [] },
  { type: "error", name: "AlreadySettled", inputs: [] },
  { type: "error", name: "BeforeEnd", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
] as const;

export const REASONS: Record<string, string> = {
  NotRegistered: "the provider is not registered",
  AlreadyRegistered: "the provider is already registered",
  BondTooSmall: "the bond is below the minimum or not an exact multiple of the unit",
  HasOpenDeal: "the provider still has an open deal",
  NoDeal: "no deal with this id",
  NotOwner: "the caller does not own this deal",
  NotProvider: "the caller is not the deal's provider",
  BadParams: "an argument is out of range or has the wrong length",
  DealExpired: "the deal's duration has passed",
  ChallengeOpen: "a challenge is already open",
  NoChallenge: "no challenge is open",
  ProofRejected: "the supplied Merkle path does not prove the stored block",
  WindowOpen: "the response window has not closed yet, or the answer arrived after its deadline",
  ZeroClaim: "there is nothing to claim",
  AlreadySettled: "the deal is already settled",
  BeforeEnd: "the deal's end block has not been reached",
  TransferFailed: "the native transfer failed",
};

export interface RefusalCase {
  id: string;
  attempted: string;
  call: { to: string; data: string; value?: string };
}

export interface RefusalsDeps {
  network: "local" | "live";
  chainId: number;
  utc: string;
  call(request: RefusalCase["call"]): Promise<{ ok: boolean; data?: string }>;
  decodeError(data: string): string | null;
}

export interface RefusalEntry {
  id: string;
  attempted: string;
  error: string;
  reason: string;
  source: "eth_call";
}

export interface RefusalsRecord {
  schema: "makhzan.refusals/v0";
  network: "LOCAL" | "LIVE";
  chainId: number;
  generatedAt: string;
  entries: RefusalEntry[];
}

export function decodeRefusal(data: string): string | null {
  try {
    return decodeErrorResult({ abi: ERROR_ABI, data: data as Hex }).errorName;
  } catch {
    return null;
  }
}

export async function runRefusals(cases: RefusalCase[], deps: RefusalsDeps): Promise<RefusalsRecord> {
  const entries: RefusalEntry[] = [];
  for (const item of cases) {
    const result = await deps.call(item.call);
    if (result.ok) throw new Error(`refusal ${item.id} unexpectedly succeeded`);
    const name = deps.decodeError(result.data ?? "0x");
    entries.push({
      id: item.id,
      attempted: item.attempted,
      error: name ?? "unknown",
      reason: name
        ? (REASONS[name] ?? "documented refusal")
        : "could not decode the revert data as an IMakhzan custom error",
      source: "eth_call",
    });
  }
  return {
    schema: "makhzan.refusals/v0",
    network: deps.network === "local" ? "LOCAL" : "LIVE",
    chainId: deps.chainId,
    generatedAt: deps.utc,
    entries,
  };
}
