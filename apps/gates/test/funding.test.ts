import { test } from "node:test";
import assert from "node:assert/strict";
import { fundingFlagText, isFunded } from "../src/lib/funding.ts";

test("isFunded is false when both balances are zero", () => {
  assert.equal(isFunded("0", "0"), false);
});

test("isFunded is true when native free is non-zero", () => {
  assert.equal(isFunded("1", "0"), true);
});

test("isFunded is true when the EVM balance is non-zero", () => {
  assert.equal(isFunded("0", "1"), true);
});

test("isFunded rejects a malformed value instead of guessing", () => {
  assert.throws(() => isFunded("not-a-number", "0"));
});

test("fundingFlagText records public values only", () => {
  const text = fundingFlagText({
    label: "owner",
    ss58: "5Example",
    evm: "0x0000000000000000000000000000000000000001",
    nativeFree: "42",
    evmWei: "420000",
    at: "2026-10-20T10:20:00Z",
  });
  assert.match(text, /^label=owner$/m);
  assert.match(text, /^ss58=5Example$/m);
  assert.match(text, /^native_free=42$/m);
  assert.match(text, /^evm_wei=420000$/m);
  assert.match(text, /^observed_at=2026-10-20T10:20:00Z$/m);
  assert.doesNotMatch(text, /KEY|private/i);
});
