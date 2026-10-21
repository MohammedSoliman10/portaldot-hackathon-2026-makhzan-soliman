import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addReadBack, assertCanAct, markExecuted, markFinalized, markIncluded, markSubmitted,
  newRecord, stageOf,
} from "../src/status.ts";

const HASH = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const BLOCK = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

test("the five state slots fill in order", () => {
  const r = newRecord("create");
  assert.equal(stageOf(r), "empty");
  markSubmitted(r, HASH, 3);
  assert.equal(stageOf(r), "submitted");
  assert.deepEqual(r.submitted, { hash: HASH, nonce: 3 });
  markIncluded(r, 7n, BLOCK);
  assert.equal(stageOf(r), "included");
  markExecuted(r, "success");
  assert.equal(stageOf(r), "executed");
  markFinalized(r, { kind: "tag", tag: "finalized" });
  assert.equal(stageOf(r), "finalized");
  addReadBack(r, "claimed", 5n ** 14n);
  assert.deepEqual(r.readBack, { claimed: 5n ** 14n });
});

test("a record refuses to act before executed", () => {
  const r = newRecord();
  assert.throws(() => assertCanAct(r), /submitted/i);
  markSubmitted(r, HASH, 0);
  markIncluded(r, 1n, BLOCK);
  assert.throws(() => assertCanAct(r), /executed/i);
  assert.throws(() => addReadBack(r, "x", 1), /executed/i);
  markExecuted(r, "success");
  assert.doesNotThrow(() => assertCanAct(r));
});

test("finalized requires an observed finality and cannot precede execution", () => {
  const r = newRecord();
  markSubmitted(r, HASH, 1);
  assert.throws(() => markFinalized(r, { kind: "tag", tag: "finalized" }), /executed/i);
  markIncluded(r, 2n, BLOCK);
  markExecuted(r, "success");
  assert.throws(() => markFinalized(r, undefined as never), /observation/i);
  markFinalized(r, { kind: "heuristic", confirmations: 64 });
  assert.deepEqual(r.finalized, { kind: "heuristic", confirmations: 64 });
});

test("a reverted transaction keeps the verbatim reason and takes no read-back", () => {
  const r = newRecord();
  markSubmitted(r, HASH, 2);
  markIncluded(r, 3n, BLOCK);
  const reason = "execution reverted: Makhzan: ZeroClaim";
  markExecuted(r, "reverted", reason);
  assert.equal(r.executed?.reason, reason);
  assert.throws(() => assertCanAct(r), new RegExp("ZeroClaim"));
  assert.throws(() => addReadBack(r, "bond", 1), /reverted/i);
  assert.equal(r.readBack, undefined);
});

test("stages cannot be skipped or rewritten", () => {
  const r = newRecord();
  assert.throws(() => markIncluded(r, 1n, BLOCK), /submitted/i);
  assert.throws(() => markExecuted(r, "success"), /included/i);
  markSubmitted(r, HASH, 0);
  assert.throws(() => markSubmitted(r, HASH, 0), /already/i);
  markIncluded(r, 1n, BLOCK);
  markExecuted(r, "success");
  assert.throws(() => markExecuted(r, "success"), /already/i);
});
