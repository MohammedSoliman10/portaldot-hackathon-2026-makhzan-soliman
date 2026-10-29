/**
 * `makhzan_gate_status(dealId)`: a StorageGate lock, the payee's provider bond, and whether
 * `release` would succeed if the payee sent it now.
 *
 * This is a prediction of a read-only kind: it evaluates the same four conditions
 * `StorageGate.release` does (lock open, guard healthy, bond floor, payee belongs to the deal's
 * provider) and says which one fails first. It never builds or sends that transaction.
 *
 * With no gate address configured the answer is "gate not deployed". The live Portaldot deployment
 * has no StorageGate, and an invented address would be worse than no answer.
 */
import type { Hex } from "viem";
import { formatTpot } from "../format.ts";
import type { Reads } from "../reads.ts";
import type { ToolResult } from "../result.ts";
import { guardDecision, type GuardDecision } from "./health.ts";

const STATUS_NAMES: Record<number, string> = { 0: "none", 1: "locked", 2: "released", 3: "refunded" };

const DECISION_REFUSAL: Record<GuardDecision, string> = {
  healthy: "the guard is satisfied",
  pending: "Pending: a challenge is open and still inside its window",
  default: "Default: a challenge passed its deadline unanswered",
  expired: "Expired: the term is over, so the guard refuses a release",
  "settled-or-none": "settled-or-none: no release can happen",
  unknown: "an unknown healthOf value",
};

export async function gateStatusTool(
  reads: Reads,
  dealId: number,
  ctx: { contract: Hex; gate: Hex | null },
): Promise<ToolResult> {
  if (ctx.gate === null) {
    const text = [
      `[MEASURED] makhzan_gate_status — deal ${dealId}`,
      "gate not deployed: MAKHZAN_GATE is unset, so there is no StorageGate address to read.",
      "Nothing about a lock, a payee or a bond is inferred. Set MAKHZAN_GATE to a deployed gate and ask again.",
      "label: MEASURED — the absence of configuration is the measured fact here.",
    ].join("\n");
    return { text, facts: { label: "MEASURED", dealId, gate: null, releaseWouldPass: null } };
  }

  const gateMakhzan = await reads.gateMakhzan();
  if (gateMakhzan.toLowerCase() !== ctx.contract.toLowerCase()) {
    throw new Error(
      `gate ${ctx.gate} points at a different Makhzan (${gateMakhzan}), not ${ctx.contract}; refusing to mix them`,
    );
  }

  const chainId = await reads.chainId();
  const head = await reads.blockNumber();
  const deal = await reads.deal(dealId);
  const health = await reads.health(dealId);
  const lock = await reads.gateLock(dealId);
  const payeeProvider = await reads.provider(lock.payee);
  // StorageGate._dealProviderBond: an unregistered payee, or one from another provider, proves no bond.
  const providerBond = payeeProvider.id === deal.providerId ? payeeProvider.bond : 0n;
  const decision = guardDecision(health, deal.endBlock, head);
  const statusName = STATUS_NAMES[lock.status] ?? `unknown (${lock.status})`;

  const locked = lock.status === 1;
  const bondOk = lock.minBond === 0n || providerBond >= lock.minBond;
  const releaseWouldPass = locked && decision === "healthy" && bondOk;

  let refusal: string;
  if (!locked) {
    refusal = `status ${lock.status} (${statusName}): no lock is open, so there is nothing to release or refund`;
  } else if (decision !== "healthy") {
    refusal = DECISION_REFUSAL[decision];
  } else if (!bondOk) {
    refusal =
      `BondTooLow: the payee's provider bond ${formatTpot(providerBond)} tPOT is under the floor ` +
      `${formatTpot(lock.minBond)} tPOT`;
  } else {
    refusal = "no condition fails";
  }

  const text = [
    `[MEASURED] makhzan_gate_status — deal ${dealId}`,
    `chain ${chainId}, Makhzan ${ctx.contract}, gate ${ctx.gate}, read at block ${head}`,
    `gate.makhzan() = ${gateMakhzan} (matches the Makhzan this server is configured for)`,
    `lock: status ${lock.status} (${statusName})`,
    `payer ${lock.payer}`,
    `payee ${lock.payee}`,
    `amount ${formatTpot(lock.amount)} tPOT (${lock.amount} planck)`,
    `minBond floor ${formatTpot(lock.minBond)} tPOT (${lock.minBond} planck)`,
    `provider ${deal.providerId} bond ${formatTpot(providerBond)} tPOT (${payeeProvider.activeDeals} active deal(s), payee id ${payeeProvider.id})`,
    `MakhzanGuard decision: ${decision}`,
    `release would pass now: ${releaseWouldPass ? "YES" : "NO"} — ${refusal}`,
    "label: MEASURED for the reads; DERIVED for the release verdict, which follows StorageGate.release's own checks.",
    "note: no transaction was built or sent. This is a read-only prediction, not a payment.",
  ].join("\n");

  return {
    text,
    facts: {
      label: "MEASURED",
      dealId,
      chainId,
      contract: ctx.contract,
      gate: ctx.gate,
      block: head,
      payer: lock.payer,
      payee: lock.payee,
      status: lock.status,
      statusName,
      amountPlanck: lock.amount.toString(),
      amountTpot: formatTpot(lock.amount),
      minBondPlanck: lock.minBond.toString(),
      minBondTpot: formatTpot(lock.minBond),
      providerId: deal.providerId,
      providerBondPlanck: providerBond.toString(),
      providerBondTpot: formatTpot(providerBond),
      decision,
      releaseWouldPass,
    },
  };
}
