import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCaps,
  formatTpot,
  formatWeiTpot,
  planckToTpot,
  weiToPlanck,
  SINGLE_CAP_WEI,
  TOTAL_CAP_WEI,
} from "../src/lib/budget.ts";

test("DR-011 caps reject a single deposit above 60 tPOT", () => {
  assert.doesNotThrow(() => assertCaps(SINGLE_CAP_WEI, 0n));
  assert.throws(() => assertCaps(SINGLE_CAP_WEI + 1n, 0n), /single deposit/);
});

test("DR-011 caps reject a total above 100 tPOT", () => {
  assert.throws(() => assertCaps(1n, TOTAL_CAP_WEI), /total/);
});

test("planck and wei formatting uses 14 and 18 decimals", () => {
  assert.equal(planckToTpot(100_000_000_000_000n), "1.00000000000000");
  assert.equal(formatTpot(1_234_500_000_000_000n), "12.34500000000000");
  assert.equal(formatWeiTpot(10n ** 18n), "1.00000000000000");
});

test("nativeToEthRatio 10000 maps one tPOT to 1e18 wei", () => {
  assert.equal(weiToPlanck(10n ** 18n), 100_000_000_000_000n);
});
