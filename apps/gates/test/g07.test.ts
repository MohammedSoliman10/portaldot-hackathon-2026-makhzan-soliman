import { test } from "node:test";
import assert from "node:assert/strict";
import { impliedFactor, mappingOutcome, workedExample, nativeToEvm } from "../src/gates/g07.ts";

test("implied factor is derived from both observed balances", () => {
  const native = 1_000_000_000_000_000n; // 10 tPOT at 14 decimals
  const evm = 100_000_000_000_000_000_000_000n; // 100,000 at 18 decimals
  assert.equal(impliedFactor(native, evm), "10000");
});

test("a zero native balance cannot produce a factor", () => {
  assert.throws(() => impliedFactor(0n, 1n), /native/);
});

test("native to EVM scaling applies the observed factor", () => {
  assert.equal(nativeToEvm(1_000_000_000_000_000n, 10000), 10_000_000_000_000_000_000n);
});

test("a zero EVM balance after mapping attempts is a FAIL", () => {
  assert.equal(mappingOutcome({ attempted: true, evmBalance: 0n, evmTransferOk: false }), "FAIL");
});

test("a run that never reached the chain is blocked, never FAIL", () => {
  assert.equal(mappingOutcome({ attempted: false, evmBalance: 0n }), "blocked");
});

test("a funded and spendable EVM balance passes", () => {
  assert.equal(mappingOutcome({ attempted: true, evmBalance: 1n, evmTransferOk: true }), "PASS");
});

test("the worked example keeps native and EVM amounts distinct", () => {
  const example = workedExample(1_000_000_000_000_000n, 10000);
  assert.equal(example.native, "1000000000000000");
  assert.equal(example.evm, "10000000000000000000");
  assert.equal(example.sentValue, "10000000000000000000");
});
