import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { bytesToHex } from "viem";
import { chunkFile } from "../src/chunk.ts";
import { buildTree } from "../src/merkle.ts";
import { blockPathFor, emptyState, writeState } from "../src/state.ts";
import { buildFilePayload, sha256Hex, verifyFile, type FilePayload } from "../src/retrieve.ts";
import { startUploadServer } from "../src/daemon.ts";
import { UploadReceiver } from "../src/upload.ts";

const BLOCK_SIZE = 1024;

function fixture(size = 3172) {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 13 + 7) & 0xff;
  const chunked = chunkFile(bytes, BLOCK_SIZE);
  const tree = buildTree(chunked.blocks);
  const dir = mkdtempSync(join(tmpdir(), "makhzan-retrieve-"));
  const stateFile = join(dir, "state.json");
  for (let i = 0; i < chunked.leafCount; i++) {
    const path = blockPathFor(stateFile, tree.root, i);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, chunked.blocks[i]);
  }
  const state = emptyState(420420777, 1);
  state.files[tree.root] = { size, leafCount: chunked.leafCount, path: `files/${tree.root}` };
  writeState(stateFile, state);
  return { bytes, chunked, tree, dir, stateFile, state };
}

function expected(fx: ReturnType<typeof fixture>) {
  return { root: fx.tree.root, size: fx.bytes.length, leafCount: fx.chunked.leafCount, blockSize: BLOCK_SIZE };
}

test("buildFilePayload returns every block with its Merkle path", () => {
  const fx = fixture();
  const payload = buildFilePayload(fx.state, fx.stateFile, fx.tree.root, BLOCK_SIZE);
  assert.equal(payload.root, fx.tree.root);
  assert.equal(payload.size, fx.bytes.length);
  assert.equal(payload.leafCount, fx.chunked.leafCount);
  assert.equal(payload.blockSize, BLOCK_SIZE);
  assert.equal(payload.blocks.length, fx.chunked.leafCount);
  assert.deepEqual(payload.blocks.map((b) => b.index), [0, 1, 2, 3]);
  assert.deepEqual(payload.blocks.map((b) => b.data), fx.chunked.blocks.map((block) => bytesToHex(block)));
  assert.ok(payload.blocks.every((b) => b.path.length > 0));
  rmSync(fx.dir, { recursive: true, force: true });
});

test("verifyFile accepts the provider payload and returns the exact bytes and sha256", () => {
  const fx = fixture();
  const payload = buildFilePayload(fx.state, fx.stateFile, fx.tree.root, BLOCK_SIZE);
  const verified = verifyFile(payload, expected(fx));
  assert.deepEqual(Buffer.from(verified.bytes), Buffer.from(fx.bytes));
  assert.equal(verified.sha256, sha256Hex(fx.bytes));
  assert.equal(verified.blockCount, fx.chunked.leafCount);
  rmSync(fx.dir, { recursive: true, force: true });
});

test("verifyFile rejects one flipped data byte with ProofRejected", () => {
  const fx = fixture();
  const payload = buildFilePayload(fx.state, fx.stateFile, fx.tree.root, BLOCK_SIZE);
  const tampered: FilePayload = JSON.parse(JSON.stringify(payload));
  const first = tampered.blocks[0].data;
  const flipped = (Number.parseInt(first.slice(2, 4), 16) ^ 1).toString(16).padStart(2, "0");
  tampered.blocks[0].data = `0x${flipped}${first.slice(4)}` as `0x${string}`;
  assert.throws(
    () => verifyFile(tampered, expected(fx)),
    /ProofRejected: block 0 does not match the expected root/,
  );
  rmSync(fx.dir, { recursive: true, force: true });
});

test("verifyFile rejects a flipped path hash with ProofRejected", () => {
  const fx = fixture();
  const payload = buildFilePayload(fx.state, fx.stateFile, fx.tree.root, BLOCK_SIZE);
  const tampered: FilePayload = JSON.parse(JSON.stringify(payload));
  const first = tampered.blocks[1].path[0];
  const flipped = (Number.parseInt(first.slice(2, 4), 16) ^ 1).toString(16).padStart(2, "0");
  tampered.blocks[1].path[0] = `0x${flipped}${first.slice(4)}` as `0x${string}`;
  assert.throws(
    () => verifyFile(tampered, expected(fx)),
    /ProofRejected: block 1 does not match the expected root/,
  );
  rmSync(fx.dir, { recursive: true, force: true });
});

test("verifyFile rejects an inconsistent on-chain size/block-size/leaf-count expectation", () => {
  const fx = fixture();
  const payload = buildFilePayload(fx.state, fx.stateFile, fx.tree.root, BLOCK_SIZE);
  assert.throws(
    () => verifyFile(payload, { ...expected(fx), leafCount: fx.chunked.leafCount + 1 }),
    /BadExpectation: leaf count does not match size and block size/,
  );
  rmSync(fx.dir, { recursive: true, force: true });
});

test("verifyFile rejects a payload whose root differs from the on-chain deal root", () => {
  const fx = fixture();
  const payload = buildFilePayload(fx.state, fx.stateFile, fx.tree.root, BLOCK_SIZE);
  assert.throws(
    () => verifyFile(payload, { ...expected(fx), root: `0x${"11".repeat(32)}` }),
    /ProofRejected: provider root .* does not match expected root/,
  );
  rmSync(fx.dir, { recursive: true, force: true });
});

test("the loopback endpoint serves a stored root and rejects an unknown root", async () => {
  const fx = fixture();
  const receiver = new UploadReceiver({ blockSize: BLOCK_SIZE, storeDir: join(fx.dir, "uploads") });
  const server = await startUploadServer(receiver, 0, (root) =>
    buildFilePayload(fx.state, fx.stateFile, root, BLOCK_SIZE),
  );
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const ok = await fetch(`${base}/file/${fx.tree.root}`);
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as FilePayload;
    const verified = verifyFile(body, expected(fx));
    assert.deepEqual(Buffer.from(verified.bytes), Buffer.from(fx.bytes));

    const missing = await fetch(`${base}/file/0x${"22".repeat(32)}`);
    assert.equal(missing.status, 404);
    const malformed = await fetch(`${base}/file/not-a-root`);
    assert.equal(malformed.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(fx.dir, { recursive: true, force: true });
  }
});
