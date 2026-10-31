import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  cleanTpot,
  formatTpot,
  formatTpotFromPlanck,
  formatTpotFromWei,
  parseTpotToPlanck,
  parseTpotToWei,
  planckToWei,
  weiToPlanck,
  WEI_PER_TPOT,
  PLANCK_PER_TPOT,
} from "../src/format.ts";

test("amount 2e18 wei converts exactly to 2 tPOT", () => {
  const amountWei = 2_000_000_000_000_000_000n; // 2e18 wei
  const formatted = formatTpotFromWei(amountWei);
  assert.equal(formatted, "2.00000000000000");
  assert.equal(cleanTpot(formatted), "2");
});

test("minBond 2e15 planck converts exactly to 20 tPOT", () => {
  const minBondPlanck = 2_000_000_000_000_000n; // 2e15 planck
  const formatted = formatTpotFromPlanck(minBondPlanck);
  assert.equal(formatted, "20.00000000000000");
  assert.equal(cleanTpot(formatted), "20");
});

test("bond 2.4e15 planck converts exactly to 24 tPOT", () => {
  const bondPlanck = 2_400_000_000_000_000n; // 2.4e15 planck
  const formatted = formatTpotFromPlanck(bondPlanck);
  assert.equal(formatted, "24.00000000000000");
  assert.equal(cleanTpot(formatted), "24");
});

test("round-trip tests for wei, planck and tPOT strings", () => {
  // Round-trip 2e18 wei <-> 2 tPOT string
  const wei2 = 2_000_000_000_000_000_000n;
  const tpotStrWei = formatTpotFromWei(wei2);
  assert.equal(parseTpotToWei(tpotStrWei), wei2);
  assert.equal(parseTpotToWei(cleanTpot(tpotStrWei)), wei2);

  // Round-trip 2e15 planck <-> 20 tPOT string
  const planck20 = 2_000_000_000_000_000n;
  const tpotStrPlanck = formatTpotFromPlanck(planck20);
  assert.equal(parseTpotToPlanck(tpotStrPlanck), planck20);
  assert.equal(parseTpotToPlanck(cleanTpot(tpotStrPlanck)), planck20);

  // Round-trip 2.4e15 planck <-> 24 tPOT string
  const planck24 = 2_400_000_000_000_000n;
  const tpotStrPlanck24 = formatTpotFromPlanck(planck24);
  assert.equal(parseTpotToPlanck(tpotStrPlanck24), planck24);
  assert.equal(parseTpotToPlanck(cleanTpot(tpotStrPlanck24)), planck24);

  // Round-trip wei <-> planck
  assert.equal(weiToPlanck(wei2), 200_000_000_000_000n); // 2e14 planck = 2 tPOT
  assert.equal(planckToWei(weiToPlanck(wei2)), wei2);
  assert.equal(weiToPlanck(planckToWei(planck20)), planck20);
});
