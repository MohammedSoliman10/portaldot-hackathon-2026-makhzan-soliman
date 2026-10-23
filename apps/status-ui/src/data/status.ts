import type { DealInfo, DealState, EvidenceStage, RoundInfo, TransactionInfo } from "./schema";

export const ROUND_STATUSES = ["pending", "submitted", "passed", "failed", "unanswered"] as const;
export const EVIDENCE_STAGES = ["submitted", "included", "executed", "finalized", "readBack"] as const;

export const STAGE_LABELS: Record<EvidenceStage, string> = {
  submitted: "submitted",
  included: "included",
  executed: "executed",
  finalized: "finalized",
  readBack: "read back",
};

export interface RoundView {
  label: string;
  note: string;
  confirmed: boolean;
  slashUnits: string | null;
}

export function roundView(_round: RoundInfo): RoundView {
  throw new Error("not implemented");
}

export function isPassedClaimSafe(_round: RoundInfo): boolean {
  throw new Error("not implemented");
}

export function stageView(_transaction: TransactionInfo): { stage: EvidenceStage; display: string; observed: boolean }[] {
  throw new Error("not implemented");
}

export function deriveDealState(_deal: DealInfo, _headBlock: number): DealState {
  throw new Error("not implemented");
}
