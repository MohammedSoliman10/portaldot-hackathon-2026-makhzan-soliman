import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runLoop, type DaemonLoop } from "../src/daemonMain.ts";

function loop(results = 2): DaemonLoop & { cycles: number; waits: number; lines: string[] } {
  const state = {
    cycles: 0,
    waits: 0,
    lines: [] as string[],
    async poll() {
      state.cycles++;
      return {
        answered: [1], passed: state.cycles === 1 ? [1] : [], failed: state.cycles === 2 ? [1] : [],
        skipped: [], unanswerable: [], unknownDeal: [],
      };
    },
    async wait() { state.waits++; },
    log(line: string) { state.lines.push(line); },
  };
  void results;
  return state;
}

test("the loop logs the five-state outcome of every cycle", async () => {
  const l = loop();
  await runLoop(l, { intervalMs: 10, iterations: 2 });
  assert.equal(l.cycles, 2);
  assert.equal(l.waits, 2);
  assert.match(l.lines[0], /submitted=\[1\]/);
  assert.match(l.lines[0], /passed=\[1\]/);
  assert.match(l.lines[1], /failed=\[1\]/);
  assert.match(l.lines[1], /unanswered=\[\]/);
});

test("an abort stops the loop after the in-flight cycle", async () => {
  const controller = new AbortController();
  const l = loop();
  const original = l.poll.bind(l);
  l.poll = async () => {
    const result = await original();
    controller.abort();
    return result;
  };
  await runLoop(l, { intervalMs: 10, signal: controller.signal });
  assert.equal(l.cycles, 1, "no second cycle after the abort");
  assert.equal(l.waits, 1);
});

test("a cycle error is reported and the loop keeps going", async () => {
  const l = loop();
  let calls = 0;
  l.poll = async () => {
    calls++;
    if (calls === 1) throw new Error("rpc down");
    return { answered: [], passed: [], failed: [], skipped: [], unanswerable: [], unknownDeal: [] };
  };
  await runLoop(l, { intervalMs: 10, iterations: 2 });
  assert.equal(calls, 2);
  assert.match(l.lines.join("\n"), /cycle failed: rpc down/);
});
