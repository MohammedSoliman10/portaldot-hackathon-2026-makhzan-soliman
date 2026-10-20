import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRecord, EvidenceError, type GateRecord } from "../src/lib/evidence.ts";
import { REPO_ROOT } from "../src/config.ts";

const RAW = "evidence/raw/setup/01-toolchain.txt";

function baseRecord(): GateRecord {
  return {
    schemaVersion: 1,
    gateId: "G07",
    runState: "done",
    verdict: "PASS",
    reason: null,
    startedAt: "2026-10-20T04:00:00Z",
    finishedAt: "2026-10-20T04:01:00Z",
    endpoint: "https://example.invalid",
    chainIdObserved: "420420777",
    commands: [
      {
        command: "node src/gates/runner.ts G07",
        cwd: "apps/gates",
        exitCode: 0,
        rawOutput: RAW,
        ranAt: "2026-10-20T04:00:10Z",
      },
    ],
    measurements: [
      {
        name: "implied-factor",
        value: 10000,
        unit: "ratio",
        method: "receipt",
        conditions: { decimals: "14/18" },
        txRef: "0x" + "11".repeat(32),
      },
    ],
    transactions: [],
    errors: [],
    verdictReason: "all required measurements obtained",
    classification: null,
    adaptation: null,
    evidenceFiles: [RAW],
  };
}

function rejects(mutator: (record: GateRecord) => void, pattern: RegExp): void {
  const record = structuredClone(baseRecord());
  mutator(record);
  assert.throws(
    () => validateRecord(record, { repoRoot: REPO_ROOT }),
    (error: unknown) => error instanceof EvidenceError && pattern.test(error.message),
  );
}

test("a record without runState is rejected", () => {
  rejects((record) => {
    delete (record as Partial<GateRecord>).runState;
  }, /runState/);
});

test("done without a verdict is rejected", () => {
  rejects((record) => {
    record.verdict = null;
  }, /verdict/);
});

test("blocked with a verdict is rejected", () => {
  rejects((record) => {
    record.runState = "blocked";
    record.reason = "RPC down";
  }, /blocked.*verdict/);
});

test("blocked without a reason is rejected", () => {
  rejects((record) => {
    record.runState = "blocked";
    record.verdict = null;
    record.reason = "";
  }, /reason/);
});

test("not_run without a reason is rejected", () => {
  rejects((record) => {
    record.runState = "not_run";
    record.verdict = null;
    record.reason = null;
  }, /reason/);
});

test("PASS with a classification is rejected", () => {
  rejects((record) => {
    record.classification = "DESIGN-CHANGE";
    record.adaptation = "something";
  }, /classification/);
});

test("DESIGN-CHANGE without an adaptation is rejected", () => {
  rejects((record) => {
    record.verdict = "PARTIAL";
    record.classification = "DESIGN-CHANGE";
    record.adaptation = null;
  }, /adaptation/);
});

test("FALLBACK-TRIGGER without a named condition is rejected", () => {
  rejects((record) => {
    record.verdict = "FAIL";
    record.classification = "FALLBACK-TRIGGER";
    record.verdictReason = "it felt blocked";
  }, /condition/);
});

test("a loaded secret value is rejected", () => {
  const secret = "0x" + "ab".repeat(32);
  const record = structuredClone(baseRecord());
  record.commands[0].command = `SOMETHING=${secret} node src/gates/runner.ts G07`;
  assert.throws(
    () => validateRecord(record, { repoRoot: REPO_ROOT, secrets: [secret] }),
    (error: unknown) => error instanceof EvidenceError && /secret/i.test(error.message),
  );
});

test("a recorded --private-key flag is rejected", () => {
  rejects((record) => {
    record.commands[0].command = "forge script Deploy --private-key 0xdeadbeef";
  }, /private-key/);
});

test("a missing evidenceFiles path is rejected", () => {
  rejects((record) => {
    record.evidenceFiles = ["evidence/raw/g07/does-not-exist.txt"];
  }, /evidenceFiles/);
});

test("timestamps out of order are rejected", () => {
  rejects((record) => {
    record.finishedAt = "2026-10-20T03:59:59Z";
  }, /finishedAt/);
});

test("a valid blocked record is accepted", () => {
  const record = structuredClone(baseRecord());
  record.runState = "blocked";
  record.verdict = null;
  record.reason = "RPC unavailable at 2026-10-20T04:00:00Z";
  record.classification = null;
  record.measurements = [];
  validateRecord(record, { repoRoot: REPO_ROOT });
});
