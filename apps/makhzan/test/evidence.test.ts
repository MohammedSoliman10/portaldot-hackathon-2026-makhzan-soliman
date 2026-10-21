import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  EvidenceRecordError, originLabel, renderBlocked, renderRound, validateRound, type RoundRecord,
} from "../src/evidenceWriter.ts";
import type { TxRecord } from "../src/status.ts";

const HASH = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const BLOCK = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

function record(overrides: Partial<RoundRecord> = {}): RoundRecord {
  const tx: TxRecord = {
    label: "answer",
    submitted: { hash: HASH, nonce: 0 },
    included: { blockNumber: 3n, blockHash: BLOCK },
    executed: { status: "success" },
    finalized: { kind: "tag", tag: "finalized" },
    readBack: { challengeOpen: false, bond: "10000000000000000" },
  };
  return { origin: "local", dealId: 1, outcome: "passed", tx, ...overrides };
}

test("a record is rejected when any one of the five statuses is missing", () => {
  for (const stage of ["submitted", "included", "executed", "finalized", "readBack"] as const) {
    const tx = record().tx;
    delete tx[stage];
    assert.throws(() => validateRound(record({ tx })), (err: Error) => {
      assert.ok(err instanceof EvidenceRecordError);
      assert.ok(err.issues.some((issue) => issue.includes(stage)), `${stage} named`);
      return true;
    });
  }
  assert.doesNotThrow(() => validateRound(record()));
});

test("a heuristic finality must label its depth", () => {
  const tx = record().tx;
  tx.finalized = { kind: "heuristic" } as never;
  assert.throws(() => validateRound(record({ tx })), /depth|confirmations/i);
  tx.finalized = { kind: "heuristic", confirmations: 64 };
  assert.doesNotThrow(() => validateRound(record({ tx })));
});

test("a key-like value is rejected by the sanitiser", () => {
  for (const bad of [
    { privateKey: "0x" + "ab".repeat(32) },
    { mnemonic: "test test test test test test test test test test test junk" },
    { apiKey: "abc123abc123abc123abc123abc123" },
    { note: "run with --private-key 0xabc" },
  ]) {
    const tx = { ...record().tx, readBack: { ...record().tx.readBack, ...bad } };
    assert.throws(() => validateRound(record({ tx })), /secret|key|private/i);
  }
});

test("a blocked item renders as BLOCKED with its reason", () => {
  assert.equal(renderBlocked("G05 fee schedule not measured"), "BLOCKED — G05 fee schedule not measured");
});

test("local and live records carry distinct labels", () => {
  assert.notEqual(originLabel("local"), originLabel("live"));
  assert.match(originLabel("local"), /local run/);
  assert.match(originLabel("live"), /pending live run/);
});

test("a rendered round names the label, the outcome and the read-back", () => {
  const text = renderRound(record());
  assert.match(text, /local run/);
  assert.match(text, /passed/);
  assert.match(text, /deal 1/);
  assert.match(text, /challengeOpen/);
  assert.match(text, new RegExp(HASH));
  assert.match(renderRound(record({ origin: "live" })), /pending live run/);
});
