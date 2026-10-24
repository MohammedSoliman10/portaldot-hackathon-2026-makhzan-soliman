/** Round evidence writer: validation, sanitising and the local/live labels. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { sanitize } from "../../gates/src/lib/evidence.ts";
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

const STAGES = ["submitted", "included", "executed", "finalized", "readBack"] as const;
const KEY_FIELD = /^(private_?key|mnemonic|seed|secret|api_?key|access_?token)$/i;

function keyLike(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => keyLike(item, `${path}[${i}].`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => {
      if (KEY_FIELD.test(key) && inner !== undefined && inner !== null && String(inner) !== "") {
        return [`key-like field ${path}${key}`];
      }
      return keyLike(inner, `${path}${key}.`);
    });
  }
  return [];
}

export function validateRound(record: RoundRecord): void {
  const issues: string[] = [];
  for (const stage of STAGES) {
    if (record.tx[stage] === undefined) {
      issues.push(`round ${record.dealId} is missing the ${stage} status`);
    }
  }
  const finalized = record.tx.finalized;
  if (
    finalized?.kind === "heuristic" &&
    (!Number.isInteger(finalized.confirmations) || finalized.confirmations < 1)
  ) {
    issues.push("a heuristic finality must label its depth (positive confirmations)");
  }
  issues.push(...keyLike(record.tx.readBack));
  issues.push(...keyLike({ note: record.note }));
  try {
    sanitize(JSON.stringify(record.tx.readBack ?? {}));
    sanitize(record.note ?? "");
  } catch (err) {
    issues.push((err as Error).message);
  }
  if (issues.length > 0) throw new EvidenceRecordError(issues);
}

export function originLabel(origin: Origin): string {
  return origin === "local" ? "[local run]" : "[pending live run]";
}

export function renderRound(record: RoundRecord): string {
  validateRound(record);
  const { tx } = record;
  const finalized =
    tx.finalized?.kind === "tag"
      ? "tag finalized"
      : `heuristic ${(tx.finalized as { confirmations: number }).confirmations} confirmations`;
  const lines = [
    `### ${record.outcome} — deal ${record.dealId} ${originLabel(record.origin)}`,
    `- submitted: ${tx.submitted?.hash} (nonce ${tx.submitted?.nonce})`,
    `- included: block ${tx.included?.blockNumber} (${tx.included?.blockHash})`,
    `- executed: ${tx.executed?.status}${tx.executed?.reason ? ` (${tx.executed.reason})` : ""}`,
    `- finalized: ${finalized}`,
    `- read-back: ${JSON.stringify(tx.readBack)}`,
  ];
  if (record.note) lines.push(`- note: ${record.note}`);
  return lines.join("\n");
}

export function renderBlocked(reason: string): string {
  return `BLOCKED — ${reason}`;
}

export async function writeRound(record: RoundRecord, path: string): Promise<void> {
  const rendered = `${renderRound(record)}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rendered, "utf8");
}
