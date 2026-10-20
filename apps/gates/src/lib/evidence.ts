import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { getGate, isGateId } from "../gates/registry.ts";

export type RunState = "done" | "blocked" | "not_run";
export type Verdict = "PASS" | "PARTIAL" | "FAIL";
export type Classification = "FALLBACK-TRIGGER" | "DESIGN-CHANGE";

export interface CommandRef {
  command: string;
  cwd: string;
  exitCode: number;
  rawOutput: string;
  ranAt: string;
}

export interface CostMeasurement {
  name: string;
  value: number | string;
  unit: string;
  method: "estimate" | "receipt" | "differential";
  conditions: Record<string, string | number>;
  txRef?: string | null;
}

export interface TransactionRef {
  hash: string;
  kind: string;
  from: string;
  to: string | null;
  blockNumber: number | null;
  status: "success" | "reverted" | "unknown";
  explorerUrl?: string | null;
  receiptPath?: string | null;
}

export interface ErrorRecord {
  stage: string;
  message: string;
  at: string;
}

export interface GateRecord {
  schemaVersion: 1;
  gateId: string;
  runState: RunState;
  verdict: Verdict | null;
  reason: string | null;
  startedAt: string;
  finishedAt: string;
  endpoint: string;
  chainIdObserved: string | null;
  commands: CommandRef[];
  measurements: CostMeasurement[];
  transactions: TransactionRef[];
  errors: ErrorRecord[];
  verdictReason: string | null;
  classification: Classification | null;
  adaptation: string | null;
  evidenceFiles: string[];
  /** Gate-specific evidence that does not fit the common schema (for example G07 accounts). */
  details?: Record<string, unknown>;
}

export interface ValidateOptions {
  repoRoot: string;
  secrets?: string[];
}

export class EvidenceError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join("; "));
    this.name = "EvidenceError";
    this.issues = issues;
  }
}

const FLAG_PATTERN = /--private-key|--mnemonic|--seed|PRIVATE_KEY=/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function sanitize(value: string, secrets: readonly string[] = []): string {
  const issues: string[] = [];
  if (FLAG_PATTERN.test(value)) issues.push("command contains a forbidden key flag (--private-key/--mnemonic/--seed) or assignment");
  for (const secret of secrets) {
    if (secret.length >= 32 && value.includes(secret)) issues.push("value contains a loaded secret");
  }
  if (issues.length > 0) throw new EvidenceError(issues);
  return value;
}

function isIsoUtc(value: string): boolean {
  return ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

export function validateRecord(record: GateRecord, options: ValidateOptions): void {
  const issues: string[] = [];
  const secrets = options.secrets ?? [];

  if (record.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (!record.gateId || !isGateId(record.gateId)) issues.push(`unknown gateId ${String(record.gateId)}`);

  const runStates: RunState[] = ["done", "blocked", "not_run"];
  if (!record.runState) {
    issues.push("runState is required");
  } else if (!runStates.includes(record.runState)) {
    issues.push(`invalid runState ${String(record.runState)}`);
  }

  if (record.runState === "done") {
    const verdicts: Verdict[] = ["PASS", "PARTIAL", "FAIL"];
    if (!record.verdict) issues.push("runState done requires a verdict");
    else if (!verdicts.includes(record.verdict)) issues.push(`invalid verdict ${String(record.verdict)}`);
  } else if (record.runState === "blocked" || record.runState === "not_run") {
    if (record.verdict) issues.push(`${record.runState} must not carry a verdict`);
    if (!record.reason || record.reason.trim() === "") issues.push(`${record.runState} requires a non-empty reason`);
  }

  if (!isIsoUtc(record.startedAt)) issues.push("startedAt must be ISO-8601 UTC");
  if (!isIsoUtc(record.finishedAt)) issues.push("finishedAt must be ISO-8601 UTC");
  if (isIsoUtc(record.startedAt) && isIsoUtc(record.finishedAt)) {
    if (Date.parse(record.finishedAt) < Date.parse(record.startedAt)) {
      issues.push("finishedAt must not be before startedAt");
    }
  }

  if (record.runState === "done") {
    if (!record.commands || record.commands.length === 0) issues.push("done requires at least one command");
  }
  if (!record.commands) issues.push("commands must be an array");

  if (record.verdict === "PASS") {
    if (record.classification !== null) issues.push("PASS must not carry a classification");
    if (record.adaptation !== null) issues.push("PASS must not carry an adaptation");
    if (record.gateId && isGateId(record.gateId)) {
      const gate = getGate(record.gateId);
      const names = new Set(record.measurements.map((measurement) => measurement.name));
      for (const required of gate.requiredMeasurements) {
        if (!names.has(required)) issues.push(`PASS is missing required measurement ${required}`);
      }
    }
  }

  if (record.verdict === "PARTIAL" || record.verdict === "FAIL") {
    if (!record.classification) issues.push("done non-PASS requires a classification");
  }

  if (record.classification === "DESIGN-CHANGE") {
    if (!record.adaptation || record.adaptation.trim() === "") {
      issues.push("DESIGN-CHANGE requires an adaptation");
    }
  }

  if (record.classification === "FALLBACK-TRIGGER") {
    const reason = record.verdictReason ?? "";
    if (!/condition\s*[1-5]/i.test(reason)) {
      issues.push("FALLBACK-TRIGGER requires verdictReason naming a condition 1-5");
    }
  }

  if (record.classification !== null && record.verdict === "PASS") {
    issues.push("classification must be null when verdict is PASS");
  }

  if (record.classification !== null && record.runState !== "done") {
    issues.push("classification is only allowed when runState is done");
  }

  for (const command of record.commands ?? []) {
    if (!command.command) issues.push("command is required");
    else {
      try {
        sanitize(command.command, secrets);
      } catch (error) {
        issues.push(`command rejected: ${(error as Error).message}`);
      }
    }
    if (!isIsoUtc(command.ranAt)) issues.push(`command ranAt is not ISO-8601 UTC: ${command.command}`);
  }

  for (const measurement of record.measurements ?? []) {
    if (!measurement.method) issues.push(`measurement ${measurement.name} is missing a method`);
    if (measurement.method === "receipt" && !measurement.txRef) {
      issues.push(`measurement ${measurement.name} uses receipt method without txRef`);
    }
  }

  for (const file of record.evidenceFiles ?? []) {
    const absolute = resolve(options.repoRoot, file);
    const evidenceRoot = resolve(options.repoRoot, "evidence");
    if (!absolute.startsWith(evidenceRoot + sep)) {
      issues.push(`evidenceFiles path is outside evidence/: ${file}`);
    } else if (!existsSync(absolute)) {
      issues.push(`evidenceFiles path does not exist: ${file}`);
    }
  }

  if (!record.evidenceFiles || record.evidenceFiles.length === 0) {
    issues.push("evidenceFiles must name at least one artifact");
  }

  if (issues.length > 0) throw new EvidenceError(issues);
}

export async function writeRecord(record: GateRecord, path: string, options: ValidateOptions): Promise<void> {
  validateRecord(record, options);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o644 });
  await rename(temp, path);
}

export function assertNoSecrets(text: string, secrets: readonly string[]): void {
  sanitize(text, secrets);
}
