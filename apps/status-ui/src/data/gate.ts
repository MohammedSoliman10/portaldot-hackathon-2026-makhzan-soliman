/**
 * StorageGate, read from outside.
 *
 * The gate is a consumer, not part of the proof: it holds one payment per deal and releases it only
 * while `MakhzanGuard.requireHealthy` is satisfied and the payee's bond clears `minBond`. Everything
 * here is a view — there is no write function in this ABI, so this module cannot spend anything.
 */
import { parseAbi } from "viem";
import { runRead, type ReadClient, type ReadResult } from "./client";
import type { Hex } from "./schema";

export const GATE_ABI = parseAbi([
  "function lockOf(uint32 dealId) view returns (address payer, uint96 amount, address payee, uint64 minBond, uint8 status)",
]);

export const LOCK_STATUSES = ["none", "locked", "released", "refunded"] as const;

export type LockStatus = (typeof LOCK_STATUSES)[number] | `unknown (${number})`;

export function lockStatusName(code: number): LockStatus {
  return LOCK_STATUSES[code] ?? `unknown (${code})`;
}

export interface LockRead {
  payer: Hex;
  payee: Hex;
  /** The payment, in planck. */
  amountUnits: string;
  /** The provider bond floor the payee must clear at release, in planck. `0` disables the check. */
  minBondUnits: string;
  status: LockStatus;
  statusCode: number;
}

const tuple = (value: unknown): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error("malformed read: expected a tuple");
  return value;
};

export function lockOf(client: ReadClient, gate: Hex, dealId: number): Promise<ReadResult<LockRead>> {
  return runRead(async () => {
    const [payer, amount, payee, minBond, status] = tuple(
      await client.readContract({ address: gate, abi: GATE_ABI, functionName: "lockOf", args: [dealId] }),
    );
    return {
      payer: String(payer) as Hex,
      payee: String(payee) as Hex,
      amountUnits: String(amount),
      minBondUnits: String(minBond),
      status: lockStatusName(Number(status)),
      statusCode: Number(status),
    };
  });
}

/** The five answers `MakhzanGuard.requireHealthy` can give, in its own order. */
export type GuardDecision = "healthy" | "pending" | "default" | "settled-or-none" | "expired";

/**
 * What the guard would say now. `healthOf` alone is not enough: it never reads the end block, so an
 * expired-but-unsettled deal still reports 1 and the guard adds the term check.
 */
export function guardDecision(health: number, block: number, endBlock: number): GuardDecision {
  if (health === 1) return block < endBlock ? "healthy" : "expired";
  if (health === 2) return "pending";
  if (health === 3) return "default";
  return "settled-or-none";
}

export type ReleaseRevertName =
  | "NotLocked"
  | "Pending"
  | "Default"
  | "SettledOrNone"
  | "Expired"
  | "BondTooLow";

export type ReleaseVerdict = { kind: "pass" } | { kind: "revert"; name: ReleaseRevertName };

/**
 * `release(dealId)` in the order the contract runs it: the lock must be held, then the guard, then
 * the bond floor. It assumes the recorded payee is the caller; this page cannot send a transaction,
 * so it reports what that call would do now rather than pretending it happened.
 */
export function releaseVerdict(input: {
  status: LockStatus;
  decision: GuardDecision;
  minBondUnits: string;
  bondUnits: string;
}): ReleaseVerdict {
  if (input.status !== "locked") return { kind: "revert", name: "NotLocked" };
  if (input.decision === "pending") return { kind: "revert", name: "Pending" };
  if (input.decision === "default") return { kind: "revert", name: "Default" };
  if (input.decision === "settled-or-none") return { kind: "revert", name: "SettledOrNone" };
  if (input.decision === "expired") return { kind: "revert", name: "Expired" };
  if (input.minBondUnits !== "0" && BigInt(input.bondUnits) < BigInt(input.minBondUnits)) {
    return { kind: "revert", name: "BondTooLow" };
  }
  return { kind: "pass" };
}

/**
 * The bond the gate actually compares with `minBond`: it looks the *payee* up as a provider and
 * requires that record's id to be the deal's provider id. Anyone else has no bond to prove and reads
 * as 0, which is why a payee that is not the provider can fail a lock it never could satisfy.
 */
export function effectiveBondUnits(
  provider: { id: number; bondUnits: string } | null,
  dealProviderId: number | null,
): string {
  if (provider === null || dealProviderId === null) return "0";
  return provider.id === dealProviderId ? provider.bondUnits : "0";
}
