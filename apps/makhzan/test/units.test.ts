import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MAX_UNITS, tPotToUnits, unitsToWei } from "../src/units.ts";

test("10 tPOT is 1e15 native units", () => {
  assert.equal(tPotToUnits("10"), 10n ** 15n);
});

test("one tPOT is 1e14 units and the smallest unit is 1e-14 tPOT", () => {
  assert.equal(tPotToUnits("1"), 10n ** 14n);
  assert.equal(tPotToUnits("0.00000000000001"), 1n);
});

test("fractions use integer math only", () => {
  assert.equal(tPotToUnits("1.5"), 15n * 10n ** 13n);
  assert.equal(tPotToUnits("0"), 0n);
});

test("more than 14 decimals is rejected, never rounded", () => {
  assert.throws(() => tPotToUnits("1.000000000000001"), /decimal/i);
});

test("negative, empty and exponent inputs are rejected", () => {
  for (const bad of ["-1", "", " ", "1e14", "0x10"]) {
    assert.throws(() => tPotToUnits(bad), /units/i);
  }
});

test("the uint64 unit cap is enforced", () => {
  assert.equal(tPotToUnits((MAX_UNITS / 10n ** 14n).toString()), MAX_UNITS - (MAX_UNITS % 10n ** 14n));
  assert.throws(() => tPotToUnits("1844674.4073709551616"), /uint64/i);
});

test("units to wei multiplies by WEI_PER_UNIT exactly", () => {
  assert.equal(unitsToWei(10n ** 15n), 10n ** 19n);
  assert.equal(unitsToWei(0n), 0n);
  assert.throws(() => unitsToWei(MAX_UNITS + 1n), /uint64/i);
});
