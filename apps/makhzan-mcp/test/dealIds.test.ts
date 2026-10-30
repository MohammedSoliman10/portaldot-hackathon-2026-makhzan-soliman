import test from "node:test";
import assert from "node:assert/strict";
import { parseDealIds } from "../src/dealIds.ts";

test("parseDealIds: defaults to [1, 2] when no argv and no env", () => {
  assert.deepEqual(parseDealIds([], {}), [1, 2]);
});

test("parseDealIds: parses comma-separated string from argv", () => {
  assert.deepEqual(parseDealIds(["1,2,3,4,5"], {}), [1, 2, 3, 4, 5]);
});

test("parseDealIds: parses multiple positional arguments from argv", () => {
  assert.deepEqual(parseDealIds(["1", "2", "3", "4", "5"], {}), [1, 2, 3, 4, 5]);
});

test("parseDealIds: parses --deals flag with comma-separated list", () => {
  assert.deepEqual(parseDealIds(["--deals", "3,4,5"], {}), [3, 4, 5]);
});

test("parseDealIds: parses --deals=val option", () => {
  assert.deepEqual(parseDealIds(["--deals=1,3,5"], {}), [1, 3, 5]);
});

test("parseDealIds: parses MAKHZAN_DEAL_IDS from env", () => {
  assert.deepEqual(parseDealIds([], { MAKHZAN_DEAL_IDS: "2,4,6" }), [2, 4, 6]);
});

test("parseDealIds: parses MAKHZAN_DEALS from env", () => {
  assert.deepEqual(parseDealIds([], { MAKHZAN_DEALS: "1,5" }), [1, 5]);
});

test("parseDealIds: argv takes precedence over env", () => {
  assert.deepEqual(parseDealIds(["3,4"], { MAKHZAN_DEAL_IDS: "1,2" }), [3, 4]);
});

test("parseDealIds: empty env string falls back to default [1, 2]", () => {
  assert.deepEqual(parseDealIds([], { MAKHZAN_DEAL_IDS: "   " }), [1, 2]);
});

test("parseDealIds: rejects non-numeric deal id", () => {
  assert.throws(() => parseDealIds(["abc"], {}), /invalid dealId/);
});

test("parseDealIds: rejects zero deal id", () => {
  assert.throws(() => parseDealIds(["0"], {}), /invalid dealId/);
});

test("parseDealIds: rejects negative deal id", () => {
  assert.throws(() => parseDealIds(["-3"], {}), /invalid dealId/);
});

test("parseDealIds: rejects fractional deal id", () => {
  assert.throws(() => parseDealIds(["1.5"], {}), /invalid dealId/);
});
