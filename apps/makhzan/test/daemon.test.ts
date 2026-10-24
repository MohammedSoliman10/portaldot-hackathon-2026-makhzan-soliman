import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { bytesToHex } from "viem";
import { chunkFile } from "../src/chunk.ts";
import { buildTree, getPath } from "../src/merkle.ts";
import { blockPathFor, emptyState, writeState, type StateFile } from "../src/state.ts";
import { MAX_ANSWER_ATTEMPTS, pollOnce, type ChainClient } from "../src/daemon.ts";

const BLOCK_SIZE = 1024;
const START = 100;
const DEAL = 1;
const HASH = "0x00000000000000000000000000000000000000000000000000000000000000aa" as const;

function fixture(size = 3172) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 11 + 5) & 0xff;
  const chunked = chunkFile(bytes, BLOCK_SIZE);
  const tree = buildTree(chunked.blocks);
  const dir = mkdtempSync(join(tmpdir(), "makhzan-daemon-"));
  const stateFile = join(dir, "state.json");
  for (let i = 0; i < chunked.leafCount; i++) {
    const p = blockPathFor(stateFile, tree.root, i);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, chunked.blocks[i]);
  }
  const state = emptyState(420420777, 1);
  state.files[tree.root] = { size, leafCount: chunked.leafCount, path: `.state/files/${tree.root}` };
  state.deals[String(DEAL)] = { role: "provider", owner: "0xowner", providerId: 1, root: tree.root };
  writeState(stateFile, state);
  return { bytes, chunked, tree, dir, stateFile, state };
}

interface Fake extends ChainClient {
  calls: { dealId: number; data: `0x${string}`; path: `0x${string}`[] }[];
  logQueries: number;
  challenge: { open: boolean; index: number; start: number; deadline: number };
  bond: bigint;
  block: number;
  /** Number of answer attempts that throw before one succeeds. */
  failures: number;
  /** Keep the challenge open even when the answer call returns (wrong-answer drill). */
  keepOpen: boolean;
  failDeals: number[];
  clock: number;
  timeoutSeen?: number;
  waitThrows?: Error;
  receiptAvailable: boolean;
  receiptStatus: "success" | "reverted";
}

function fakeClient(
  challenge: { open: boolean; index: number; start: number; deadline?: number },
  only?: number,
): Fake {
  const f: Fake = {
    calls: [],
    logQueries: 0,
    challenge: { ...challenge, deadline: challenge.deadline ?? challenge.start + 10 },
    bond: 10n ** 16n,
    block: START,
    failures: 0,
    keepOpen: false,
    failDeals: [],
    clock: 0,
    receiptAvailable: true,
    receiptStatus: "success",
    async challengeStateOf(dealId) {
      const open = only === undefined ? f.challenge.open : only === dealId && f.challenge.open;
      return {
        open, index: f.challenge.index, start: f.challenge.start, deadline: f.challenge.deadline,
        expectedPathLength: 2,
      };
    },
    async answer(dealId, data, path) {
      f.calls.push({ dealId, data, path });
      if (f.failures > 0 || f.failDeals.includes(dealId)) {
        if (f.failures > 0) f.failures--;
        throw new Error("execution reverted: ProofRejected");
      }
      if (!f.keepOpen && (only === undefined || only === dealId)) f.challenge.open = false;
      return { hash: HASH };
    },
    async waitReceipt(_hash, _action, timeoutMs) {
      f.timeoutSeen = timeoutMs;
      f.clock += 40_000; // simulated slow block: 40 s, well under the 120 s minimum
      if (f.waitThrows) throw f.waitThrows;
      return { status: f.receiptStatus, blockNumber: f.block, blockHash: HASH };
    },
    async receiptOf() {
      if (!f.receiptAvailable) return null;
      return { status: f.receiptStatus, blockNumber: f.block, blockHash: HASH };
    },
    async blockNumber() {
      return f.block;
    },
    async bondOf() {
      return f.bond;
    },
  };
  return f;
}

test("a poll cycle reads challengeStateOf and never queries logs", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 3, start: START });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });

  assert.equal(client.logQueries, 0, "no eth_getLogs over a historic range");
  assert.equal(client.calls.length, 1, "one answer for the open challenge");
  assert.equal(client.calls[0].dealId, DEAL);
  assert.deepEqual(Buffer.from(client.calls[0].data.slice(2), "hex"), Buffer.from(fx.chunked.blocks[3]));
  assert.deepEqual(client.calls[0].path, getPath(fx.tree, 3));
  const record = fx.state.deals[String(DEAL)].lastChallenge;
  assert.equal(record?.status, "passed", "labelled from the read-back, not from the send");
  assert.equal(record?.hash, HASH, "the tx hash is recorded");
  assert.equal(record?.blockNumber, START, "the block number is recorded");
  assert.equal(record?.bondBefore, (10n ** 16n).toString());
  assert.deepEqual(result.passed, [DEAL]);
});

test("a closed challenge submits nothing and records nothing", async () => {
  const fx = fixture();
  const client = fakeClient({ open: false, index: 0, start: 0 });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(client.calls.length, 0);
  assert.deepEqual(result.answered, []);
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge, undefined);
});

test("a failed answer attempt stays pending and is retried on the next poll", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 1, start: START });
  client.failures = 1;

  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  let record = fx.state.deals[String(DEAL)].lastChallenge;
  assert.equal(client.calls.length, 1);
  assert.equal(record?.status, "pending", "a throw never becomes a pass");
  assert.equal(record?.attempts, 1);
  assert.equal(record?.hash, undefined, "no hash for an attempt that produced no receipt");

  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  record = fx.state.deals[String(DEAL)].lastChallenge;
  assert.equal(client.calls.length, 2, "the second poll retried");
  assert.equal(record?.status, "passed");
  assert.equal(record?.attempts, 2);
  assert.equal(record?.hash, HASH);
});

test("a reverted answer is never labelled passed", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 0, start: START });
  client.failures = 99;
  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "pending");

  // The round closes without a slash; because the daemon never got a successful send it must not
  // claim a pass.
  client.challenge.open = false;
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.notEqual(fx.state.deals[String(DEAL)].lastChallenge?.status, "passed");
  assert.deepEqual(result.passed, []);
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "unanswered");
});

test("one failing deal does not stop the next deal", async () => {
  const fx = fixture();
  fx.state.deals["2"] = { role: "provider", owner: "0xowner", providerId: 1, root: fx.tree.root };
  const client = fakeClient({ open: true, index: 2, start: START });
  client.failDeals = [DEAL];

  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.deepEqual(client.calls.map((c) => c.dealId), [DEAL, 2]);
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "pending");
  assert.equal(fx.state.deals["2"].lastChallenge?.status, "passed");
  assert.deepEqual(result.passed, [2]);
});

test("a late answer ends as unanswered without sending", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 0, start: START });
  fd: {
    client.failures = 1;
    await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
    assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "pending");
  }
  client.block = START + 11; // past the deadline
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(client.calls.length, 1, "no second send after the deadline");
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "unanswered");
  assert.deepEqual(result.answered, []);
});

test("drill mode answers with the wrong bytes, records submitted, and only then failed on a slash", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 1, start: START });
  client.keepOpen = true;
  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile, drill: "wrong" });

  assert.equal(client.calls.length, 1);
  assert.notDeepEqual(Buffer.from(client.calls[0].data.slice(2), "hex"), Buffer.from(fx.chunked.blocks[1]));
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "submitted");
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.hash, HASH);

  // resolve after the window slashes 20%
  client.challenge.open = false;
  client.bond = 8n * 10n ** 15n;
  client.block = START + 11;
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "failed");
  assert.deepEqual(result.failed, [DEAL]);
  assert.deepEqual(result.passed, []);
});

test("drill mode can skip the answer and still ends failed after the slash", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 0, start: START });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile, drill: "skip" });

  assert.equal(client.calls.length, 0);
  assert.deepEqual(result.skipped, [DEAL]);
  const skipped = fx.state.deals[String(DEAL)].lastChallenge;
  assert.equal(skipped?.status, "pending");
  assert.equal(skipped?.attempts, MAX_ANSWER_ATTEMPTS, "a deliberate skip is not retried");

  client.challenge.open = false;
  client.bond = 8n * 10n ** 15n;
  client.block = START + 11;
  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "failed");
});

test("a challenge on an unknown deal is reported unanswerable", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 0, start: START }, 2);
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile, dealIds: [2] });
  assert.deepEqual(result.unanswerable, ["unanswerable: unknown deal 2"]);
  assert.deepEqual(result.unknownDeal, [2]);
  assert.equal(client.calls.length, 0);
});

test("a restart resumes without re-answering an already handled round", async () => {
  const fx = fixture();
  fx.state.deals[String(DEAL)].lastChallenge = {
    index: 3, start: START, status: "passed", hash: HASH, blockNumber: START,
  };
  const client = fakeClient({ open: true, index: 3, start: START });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(client.calls.length, 0, "no duplicate answer after a restart");
  assert.deepEqual(result.answered, []);
});

test("a submitted round is re-read after a restart, never re-sent", async () => {
  const fx = fixture();
  fx.state.deals[String(DEAL)].lastChallenge = {
    index: 3, start: START, status: "submitted", hash: HASH, blockNumber: START,
    bondBefore: (10n ** 16n).toString(),
  };
  const client = fakeClient({ open: false, index: 3, start: START });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(client.calls.length, 0);
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "passed");
  assert.deepEqual(result.passed, [DEAL]);
});

test("a 40 s delayed receipt stays submitted and is labelled passed on a later poll", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 2, start: START });
  client.keepOpen = true;
  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile, receiptTimeoutMs: 120_000 });

  let record = fx.state.deals[String(DEAL)].lastChallenge;
  assert.equal(client.clock, 40_000, "the fake receipt arrived after a simulated 40 s");
  assert.equal(client.timeoutSeen, 120_000, "the wait is at least the 120 s minimum");
  assert.equal(record?.status, "submitted", "the known hash stays submitted while the round is open");
  assert.equal(record?.hash, HASH);
  assert.deepEqual(client.calls.map((c) => c.dealId), [DEAL], "no duplicate send");

  client.challenge.open = false;
  client.block = START + 41;
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  record = fx.state.deals[String(DEAL)].lastChallenge;
  assert.equal(record?.status, "passed", "the later read-back labels the round");
  assert.deepEqual(result.passed, [DEAL]);
  assert.equal(client.calls.length, 1);
});

test("a lost receipt response keeps the hash submitted, then the next poll labels passed", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 1, start: START });
  client.waitThrows = new Error("Timed out while waiting for the receipt");
  client.receiptAvailable = false;

  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  let record = fx.state.deals[String(DEAL)].lastChallenge;
  assert.equal(record?.status, "submitted", "a timeout with a known hash never becomes unanswered");
  assert.equal(record?.hash, HASH);
  assert.equal(client.calls.length, 1);

  client.challenge.open = false;
  client.receiptAvailable = true;
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  record = fx.state.deals[String(DEAL)].lastChallenge;
  assert.equal(record?.status, "passed");
  assert.deepEqual(result.passed, [DEAL]);
  assert.equal(client.calls.length, 1, "the hash was never re-sent");
});

test("a closed challenge after a receipt timeout is labelled from the read-back, never unanswered", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 0, start: START });
  client.waitThrows = new Error("receipt wait timed out");
  client.receiptAvailable = false;
  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });

  client.challenge.open = false;
  client.block = START + 11;
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  const record = fx.state.deals[String(DEAL)].lastChallenge;
  assert.notEqual(record?.status, "unanswered");
  assert.equal(record?.status, "submitted", "without a receipt the daemon does not guess");
  assert.deepEqual(result.unanswerable, []);
  assert.equal(client.calls.length, 1);
});

test("a submitted round past the deadline stays submitted, not unanswered", async () => {
  const fx = fixture();
  fx.state.deals[String(DEAL)].lastChallenge = {
    index: 1, start: START, status: "submitted", hash: HASH, blockNumber: START,
    bondBefore: (10n ** 16n).toString(),
  };
  const client = fakeClient({ open: true, index: 1, start: START, deadline: START + 10 });
  client.block = START + 11;
  client.receiptAvailable = false;

  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "submitted");
  assert.equal(client.calls.length, 0, "never resend a known hash");
  assert.deepEqual(result.unanswerable, []);
});

test("a timed-out answer that was slashed becomes failed from the read-back", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 0, start: START });
  client.waitThrows = new Error("receipt wait timed out");
  client.receiptAvailable = false;
  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });

  client.challenge.open = false;
  client.bond = 8n * 10n ** 15n;
  client.receiptAvailable = true;
  client.block = START + 11;
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge?.status, "failed");
  assert.deepEqual(result.failed, [DEAL]);
});

test("a missing block is reported, never guessed", async () => {
  const fx = fixture();
  rmSync(blockPathFor(fx.stateFile, fx.tree.root, 2));
  const client = fakeClient({ open: true, index: 2, start: START });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(client.calls.length, 0);
  assert.equal(result.unanswerable.length, 1);
  assert.match(result.unanswerable[0], /missing block 2/);
});
