import { strict as assert } from "node:assert";
import { test } from "node:test";
import { withRetry } from "../src/retry.ts";

test("withRetry returns the first success and does not retry it", async () => {
  let calls = 0;
  const value = await withRetry("read", async () => {
    calls += 1;
    return 7;
  });
  assert.equal(value, 7);
  assert.equal(calls, 1);
});

test("withRetry retries exactly once after a failure", async () => {
  let calls = 0;
  const value = await withRetry("read", async () => {
    calls += 1;
    if (calls === 1) throw new Error("connection reset");
    return "ok";
  });
  assert.equal(value, "ok");
  assert.equal(calls, 2);
});

test("withRetry gives up after two attempts and keeps both messages", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry("eth_getLogs", async () => {
      calls += 1;
      throw new Error(`boom ${calls}`);
    }),
    (error: Error) => {
      assert.match(error.message, /eth_getLogs failed after 2 attempts/);
      assert.match(error.message, /boom 1/);
      assert.match(error.message, /boom 2/);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("withRetry times an attempt out at the configured budget and retries it", async () => {
  let calls = 0;
  const started = Date.now();
  await assert.rejects(
    withRetry(
      "healthOf",
      async () => {
        calls += 1;
        return await new Promise<never>(() => {}); // a node that never answers
      },
      { timeoutMs: 25 },
    ),
    /healthOf timed out after 25 ms/,
  );
  assert.equal(calls, 2);
  assert.ok(Date.now() - started < 2_000, "the timeout must be bounded, not the test suite");
});
