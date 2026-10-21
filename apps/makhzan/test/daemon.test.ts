import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { bytesToHex } from "viem";
import { chunkFile } from "../src/chunk.ts";
import { buildTree, getPath } from "../src/merkle.ts";
import { blockPathFor, emptyState, writeState, type StateFile } from "../src/state.ts";
import { pollOnce, type ChainClient } from "../src/daemon.ts";

const BLOCK_SIZE = 1024;
const START = 100;
const DEAL = 1;

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
  challenge: { open: boolean; index: number; start: number };
}

function fakeClient(challenge: { open: boolean; index: number; start: number }, only?: number): Fake {
  const f: Fake = {
    calls: [],
    logQueries: 0,
    challenge,
    async challengeStateOf(dealId) {
      const open = only === undefined ? f.challenge.open : only === dealId && f.challenge.open;
      return { ...f.challenge, open, deadline: f.challenge.start + 50, expectedPathLength: 2 };
    },
    async answer(dealId, data, path) {
      f.calls.push({ dealId, data, path });
      return { hash: "0x0000000000000000000000000000000000000000000000000000000000000001" };
    },
  };
  return f;
}

test("a poll cycle reads challengeStateOf and never queries logs", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 3, start: START });
  await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });

  assert.equal(client.logQueries, 0, "no eth_getLogs over a historic range");
  assert.equal(client.calls.length, 1, "one answer for the open challenge");
  assert.equal(client.calls[0].dealId, DEAL);
  assert.deepEqual(Buffer.from(client.calls[0].data.slice(2), "hex"), Buffer.from(fx.chunked.blocks[3]));
  assert.deepEqual(client.calls[0].path, getPath(fx.tree, 3));
});

test("a closed challenge submits nothing and records nothing", async () => {
  const fx = fixture();
  const client = fakeClient({ open: false, index: 0, start: 0 });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(client.calls.length, 0);
  assert.deepEqual(result.answered, []);
  assert.equal(fx.state.deals[String(DEAL)].lastChallenge, undefined);
});

test("drill mode answers with the wrong bytes and records the round as failed", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 1, start: START });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile, drill: "wrong" });

  assert.equal(client.calls.length, 1);
  assert.notDeepEqual(Buffer.from(client.calls[0].data.slice(2), "hex"), Buffer.from(fx.chunked.blocks[1]));
  assert.deepEqual(result.answered, [DEAL]);
  assert.deepEqual(fx.state.deals[String(DEAL)].lastChallenge, { index: 1, start: START, status: "failed" });
});

test("drill mode can skip the answer and still records the round as failed", async () => {
  const fx = fixture();
  const client = fakeClient({ open: true, index: 0, start: START });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile, drill: "skip" });

  assert.equal(client.calls.length, 0);
  assert.deepEqual(result.skipped, [DEAL]);
  assert.deepEqual(fx.state.deals[String(DEAL)].lastChallenge, { index: 0, start: START, status: "failed" });
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
  fx.state.deals[String(DEAL)].lastChallenge = { index: 3, start: START, status: "passed" };
  const client = fakeClient({ open: true, index: 3, start: START });
  const result = await pollOnce({ client, state: fx.state, stateFile: fx.stateFile });
  assert.equal(client.calls.length, 0, "no duplicate answer after a restart");
  assert.deepEqual(result.answered, []);
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
