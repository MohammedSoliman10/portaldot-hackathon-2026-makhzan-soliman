import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTick, dayFileFor, utcStamp } from "../src/probe/daemon.ts";

test("a tick records exactly one outcome per endpoint", () => {
  const tick = buildTick(
    new Date("2026-10-20T05:00:00Z"),
    { ok: true, latencyMs: 12, blockNumber: 100, chainId: "420420777" },
    { ok: false, error: "connection refused" },
  );
  assert.equal(tick.evm.ok, true);
  assert.equal(tick.ws.ok, false);
  assert.equal(tick.ws.error, "connection refused");
});

test("a tick with both ok and error is rejected", () => {
  assert.throws(
    () =>
      buildTick(
        new Date("2026-10-20T05:00:00Z"),
        { ok: true, error: "both", latencyMs: 1 },
        { ok: true, latencyMs: 1, blockNumber: 1, source: "chain_subscribeNewHeads" },
      ),
    /exactly one/,
  );
});

test("timestamps are ISO-8601 UTC at second precision", () => {
  assert.equal(utcStamp(new Date("2026-10-20T05:00:00.987Z")), "2026-10-20T05:00:00Z");
});

test("the day file rotates on the UTC date", () => {
  const before = dayFileFor(new Date("2026-10-20T23:59:59Z"));
  const after = dayFileFor(new Date("2026-10-21T00:00:00Z"));
  assert.match(before, /2026-10-20\.jsonl$/);
  assert.match(after, /2026-10-21\.jsonl$/);
  assert.notEqual(before, after);
});
