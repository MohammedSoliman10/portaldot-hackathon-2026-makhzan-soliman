import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bytesToHex } from "viem";
import { chunkFile } from "../src/chunk.ts";
import { buildTree } from "../src/merkle.ts";
import { UploadReceiver } from "../src/upload.ts";

const BLOCK_SIZE = 1024;

function file(size: number): { bytes: Uint8Array; root: `0x${string}`; leafCount: number; blocks: Uint8Array[] } {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 7 + 3) & 0xff;
  const chunked = chunkFile(bytes, BLOCK_SIZE);
  const tree = buildTree(chunked.blocks);
  return { bytes, root: tree.root, leafCount: chunked.leafCount, blocks: chunked.blocks };
}

function envelope(
  f: ReturnType<typeof file>,
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    root: f.root,
    size: f.bytes.length,
    leafCount: f.leafCount,
    blockSize: BLOCK_SIZE,
    index,
    data: bytesToHex(f.blocks[index]),
    ...overrides,
  };
}

function receiver(): { r: UploadReceiver; dir?: string } {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-upload-"));
  return { r: new UploadReceiver({ blockSize: BLOCK_SIZE, storeDir: dir }), dir };
}

test("a complete valid file is acknowledged with (root, size, leafCount)", () => {
  const { r, dir } = receiver();
  const f = file(3172);
  assert.equal(r.accept(envelope(f, 0)), undefined, "no acknowledgement before the file is complete");
  assert.equal(r.accept(envelope(f, 1)), undefined);
  assert.equal(r.accept(envelope(f, 2)), undefined);
  const ack = r.accept(envelope(f, 3));
  assert.deepEqual(ack, { root: f.root, size: 3172, leafCount: 4 });
  assert.ok(existsSync(join(dir, f.root, "3")), "the last block is on disk");
  rmSync(dir, { recursive: true, force: true });
});

test("an extra field is rejected", () => {
  const { r } = receiver();
  const f = file(1024);
  assert.throws(() => r.accept({ ...envelope(f, 0), extra: 1 }), /unknown field 'extra'/);
});

test("a missing field is rejected", () => {
  const { r } = receiver();
  const f = file(1024);
  const missing = envelope(f, 0);
  delete missing.data;
  assert.throws(() => r.accept(missing), /missing field 'data'/);
});

test("a wrong block size is rejected", () => {
  const { r } = receiver();
  const f = file(1024);
  assert.throws(() => r.accept(envelope(f, 0, { blockSize: 512 })), /block size 512 does not match 1024/);
});

test("an out-of-range index is rejected", () => {
  const { r } = receiver();
  const f = file(2048);
  assert.throws(() => r.accept(envelope(f, 2, { index: 5 })), /index 5 is outside 0\.\.1/);
  assert.throws(() => r.accept(envelope(f, 0, { index: -1 })), /index -1 is outside/);
});

test("a wrong data length is rejected", () => {
  const { r } = receiver();
  const f = file(3172);
  assert.throws(() => r.accept(envelope(f, 0, { data: "0x00" })), /block 0 has 1 byte, expected 1024/);
  assert.throws(
    () => r.accept(envelope(f, 3, { data: bytesToHex(f.blocks[2]) })),
    /block 3 has 1024 bytes, expected 100/,
  );
});

test("a block out of order is rejected", () => {
  const { r } = receiver();
  const f = file(2048);
  assert.throws(() => r.accept(envelope(f, 1)), /block 1 arrived out of order, expected 0/);
});

test("a declared root that does not match the recomputed root is rejected", () => {
  const { r } = receiver();
  const f = file(2048);
  const other = file(3172);
  assert.equal(r.accept(envelope(f, 0)), undefined);
  const bad = envelope(f, 1, { root: other.root });
  // start a fresh session under the wrong root so the ordering check does not fire first
  const fresh = receiver();
  assert.equal(fresh.r.accept(envelope(f, 0, { root: other.root })), undefined);
  assert.throws(() => fresh.r.accept(envelope(f, 1, { root: other.root })), /recomputed root/);
  assert.throws(() => r.accept(bad), /recomputed root|out of order/);
});

test("size and leaf count must agree with ceil(size/blockSize)", () => {
  const { r } = receiver();
  const f = file(2048);
  assert.throws(() => r.accept(envelope(f, 0, { leafCount: 3 })), /leaf count 3 does not match/);
  assert.throws(() => r.accept(envelope(f, 0, { size: 0 })), /size must be positive/);
});

test("a malformed value type is rejected with a verbatim reason", () => {
  const { r } = receiver();
  const f = file(1024);
  assert.throws(() => r.accept("not an object"), /envelope must be an object/);
  assert.throws(() => r.accept(envelope(f, 0, { root: "0x1234" })), /root must be 32 bytes/);
  assert.throws(() => r.accept(envelope(f, 0, { data: "zz" })), /data must be 0x-prefixed bytes/);
});
