/** Round evidence writer: validation, sanitising and the local/live labels. */
import type { TxRecord } from "./status.ts";

export type Origin = "local" | "live";
export type Outcome = "passed" | "slashed";

export interface RoundRecord {
  origin: Origin;
  dealId: number;
  outcome: Outcome;
  tx: TxRecord;
  note?: string;
}

export class EvidenceRecordError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join("; "));
    this.name = "EvidenceRecordError";
    this.issues = issues;
  }
}

export function validateRound(_record: RoundRecord): void {
  throw new Error("not implemented");
}

export function renderRound(_record: RoundRecord): string {
  throw new Error("not implemented");
}

export function renderBlocked(_reason: string): string {
  throw new Error("not implemented");
}

export function originLabel(_origin: Origin): string {
  throw new Error("not implemented");
}

export async function writeRound(_record: RoundRecord, _path: string): Promise<void> {
  throw new Error("not implemented");
}
