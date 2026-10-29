/**
 * `makhzan_health(dealId)`: the two facts a payer actually needs, from two views.
 *
 * `healthOf` answers only "is a challenge open, and is it past its deadline". It never looks at the
 * term (contracts/src/makhzan/MakhzanGuard.sol says so in its header). So the decision here is the
 * guard's rule, computed from `healthOf`, `endBlock` and the block the reads were taken at — and it
 * is labelled as such, not as a view the chain returned.
 */
import { formatCount } from "../format.ts";
import type { Reads } from "../reads.ts";
import type { ToolResult } from "../result.ts";
import type { Hex } from "viem";

export type GuardDecision = "healthy" | "pending" | "default" | "settled-or-none" | "expired" | "unknown";

const HEALTH_NAMES: Record<number, string> = {
  0: "settled-or-none",
  1: "healthy",
  2: "pending",
  3: "default",
};

/**
 * MakhzanGuard.requireHealthy: `healthOf(dealId) == 1 && block.number < endBlockOf(dealId)`.
 * Expiry is checked even when a challenge is open, because either way release is impossible.
 */
export function guardDecision(health: number, endBlock: number, head: number): GuardDecision {
  if (health === 0) return "settled-or-none";
  if (head >= endBlock) return "expired";
  if (health === 1) return "healthy";
  if (health === 2) return "pending";
  if (health === 3) return "default";
  return "unknown";
}

const DECISION_TEXT: Record<GuardDecision, string> = {
  healthy: "a release would pass the guard",
  pending: "a challenge is open inside its window",
  default: "a challenge was not answered before its deadline",
  "settled-or-none": "the deal is settled or does not exist",
  expired: "the term is over, so the guard refuses a release",
  unknown: "healthOf returned a value this tool does not know",
};

export async function healthTool(reads: Reads, dealId: number, ctx: { contract: Hex }): Promise<ToolResult> {
  const chainId = await reads.chainId();
  const head = await reads.blockNumber();
  const deal = await reads.deal(dealId);
  const health = await reads.health(dealId);

  const blocksLeft = deal.endBlock - head;
  const decision = guardDecision(health, deal.endBlock, head);
  const healthName = HEALTH_NAMES[health] ?? `unknown (${health})`;

  const term =
    blocksLeft >= 0
      ? `blocksLeft ${blocksLeft} (head ${head}, endBlock ${deal.endBlock})`
      : `term over by ${formatCount(-blocksLeft)} blocks (head ${head}, endBlock ${deal.endBlock})`;

  const text = [
    `[MEASURED] makhzan_health — deal ${dealId}`,
    `chain ${chainId}, Makhzan ${ctx.contract}, read at block ${head}`,
    `healthOf ${health} (${healthName})`,
    term,
    `MakhzanGuard decision: ${decision} — ${DECISION_TEXT[decision]}`,
    "label: MEASURED for healthOf and the block number; DERIVED for blocksLeft and the guard decision.",
  ].join("\n");

  return {
    text,
    facts: {
      label: "MEASURED",
      dealId,
      chainId,
      contract: ctx.contract,
      block: head,
      health,
      healthName,
      endBlock: deal.endBlock,
      blocksLeft,
      decision,
    },
  };
}
