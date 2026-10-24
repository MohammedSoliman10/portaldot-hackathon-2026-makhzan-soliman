import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_RESERVE_TPOT, checkReserve } from "../src/deploy.ts";

const E18 = 10n ** 18n;

test("the default reserve is 100 tPOT, not 500", () => {
  assert.equal(DEFAULT_RESERVE_TPOT, 100n);
});

test("owner 800 tPOT with a 517 tPOT estimate passes a 100 tPOT reserve", () => {
  assert.doesNotThrow(() => checkReserve(800n * E18, 517n * E18, 100n));
});

test("owner 600 tPOT with a 517 tPOT estimate refuses a 100 tPOT reserve", () => {
  const balance = 600n * E18;
  const cost = 517n * E18;
  assert.throws(
    () => checkReserve(balance, cost, 100n),
    (err: Error) =>
      /below the DR-012 reserve of 100 tPOT/.test(err.message) &&
      /balance 600\.000000 tPOT/.test(err.message) &&
      /estimate 517\.000000 tPOT/.test(err.message) &&
      /leaves 83\.000000 tPOT/.test(err.message),
  );
});

test("a balance exactly at cost plus reserve passes", () => {
  assert.doesNotThrow(() => checkReserve(617n * E18, 517n * E18, 100n));
});
