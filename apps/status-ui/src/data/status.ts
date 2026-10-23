import type { DealInfo, DealState, EvidenceStage, RoundInfo, RoundStatus, TransactionInfo } from "./schema";

export const ROUND_STATUSES = ["pending", "submitted", "passed", "failed", "unanswered"] as const;
export const EVIDENCE_STAGES = ["submitted", "included", "executed", "finalized", "readBack"] as const;

export interface RoundLabel {
  label: string;
  description: string;
}

/** The round vocabulary from the daemon (`apps/makhzan/src/state.ts`), not the transaction one. */
export const ROUND_LABELS: Record<RoundStatus, RoundLabel> = {
  pending: { label: "pending", description: "a challenge is scheduled but has not been submitted" },
  submitted: { label: "submitted", description: "the challenge is open and not resolved yet" },
  passed: { label: "passed", description: "the answer verified and the read-back closed the challenge" },
  failed: { label: "failed", description: "the deadline passed without a valid answer; the bond was slashed" },
  unanswered: { label: "unanswered", description: "no answer was recorded and no outcome was observed" },
};

export const STAGE_LABELS: Record<EvidenceStage, string> = {
  submitted: "submitted",
  included: "included",
  executed: "executed",
  finalized: "finalized",
  readBack: "read back",
};

export interface RoundView {
  label: string;
  description: string;
  note: string;
  confirmed: boolean;
  slashUnits: string | null;
}

/**
 * A `passed` row is only a pass when the read-back closed the challenge and the bond did not move.
 * Anything else keeps the recorded word but is explicitly unconfirmed — absence is never a pass.
 */
function passConfirmed(round: RoundInfo): boolean {
  return (
    round.status === "passed" &&
    round.readBack.challengeOpenAfter === false &&
    round.bondBeforeUnits === round.bondAfterUnits &&
    round.slashUnits === "0"
  );
}

function failConfirmed(round: RoundInfo): boolean {
  if (round.status !== "failed") return false;
  const slash = BigInt(round.slashUnits);
  return slash > 0n && BigInt(round.bondBeforeUnits) - slash === BigInt(round.bondAfterUnits);
}

export function isPassedClaimSafe(round: RoundInfo): boolean {
  return passConfirmed(round);
}

export function roundView(round: RoundInfo): RoundView {
  const label = ROUND_LABELS[round.status];
  const confirmed = round.status === "passed" ? passConfirmed(round) : round.status === "failed" ? failConfirmed(round) : false;

  let note: string;
  switch (round.status) {
    case "passed":
      note = confirmed
        ? "read-back: the challenge is closed and the bond is unchanged"
        : "read-back does not confirm the pass; treated as unconfirmed";
      break;
    case "failed":
      note = confirmed
        ? "read-back: the bond fell by exactly the slash"
        : "the slash arithmetic is not confirmed by the read-back";
      break;
    case "submitted":
      note = "challenge open — not resolved";
      break;
    case "pending":
      note = "not submitted";
      break;
    case "unanswered":
      note = "no answer and no outcome observed";
      break;
  }

  return {
    label: label.label,
    description: label.description,
    note,
    confirmed,
    slashUnits: BigInt(round.slashUnits) > 0n ? round.slashUnits : null,
  };
}

export function stageView(
  transaction: TransactionInfo,
): { stage: EvidenceStage; display: string; observed: boolean }[] {
  const observed = new Set(transaction.stages);
  return EVIDENCE_STAGES.map((stage) => ({
    stage,
    display: STAGE_LABELS[stage],
    observed: observed.has(stage),
  }));
}

/** Shared with the evidence writer: the settled flag wins, then the head block. */
export function deriveDealState(deal: DealInfo, headBlock: number): DealState {
  if ((deal.flags & 1) === 1) return "settled";
  if (headBlock > deal.endBlock) return "expired";
  return "active";
}
