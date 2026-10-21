import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chunkFile, MAX_BLOCK_SIZE } from "../src/chunk.ts";

function pattern(size: number): Uint8Array {
  const out = new Uint8Array(size);
  let x = 0x1234_5678;
  for (let i = 0; i < size; i++) {
    x = (x * 1_103_515_245 + 12_345) >>> 0;
    out[i] = x & 0xff;
  }
  return out;
}

test("1 MiB with 1 KiB blocks yields 1024 leaves", () => {
  const data = pattern(1024 * 1024);
  const file = chunkFile(data, 1024);
  assert.equal(file.leafCount, 1024);
  assert.equal(file.size, 1024 * 1024);
  assert.equal(file.blocks.length, 1024);
  assert.equal(file.leafCount, Math.ceil(file.size / file.blockSize));
});

test("every block except the last is exactly blockSize and the last is the remainder", () => {
  const data = pattern(3172);
  const file = chunkFile(data, 1024);
  assert.equal(file.leafCount, 4);
  for (let i = 0; i < file.leafCount - 1; i++) {
    assert.equal(file.blocks[i].length, 1024, `block ${i} is full`);
    assert.deepEqual(Buffer.from(file.blocks[i]), Buffer.from(data.subarray(i * 1024, (i + 1) * 1024)));
  }
  assert.equal(file.blocks[3].length, 100);
  assert.deepEqual(Buffer.from(file.blocks[3]), Buffer.from(data.subarray(3072)));
});

test("a file smaller than one block yields one leaf with the whole file", () => {
  const data = pattern(7);
  const file = chunkFile(data, 1024);
  assert.equal(file.leafCount, 1);
  assert.equal(file.blocks[0].length, 7);
  assert.deepEqual(Buffer.from(file.blocks[0]), Buffer.from(data));
});

test("an exact multiple of the block size has no empty last block", () => {
  const file = chunkFile(pattern(2048), 1024);
  assert.equal(file.leafCount, 2);
  assert.equal(file.blocks[1].length, 1024);
});

test("a zero-length file is rejected", () => {
  assert.throws(() => chunkFile(new Uint8Array(0), 1024), /empty/i);
});

test("the block size must be an integer inside 1..65535", () => {
  const data = pattern(4);
  for (const bad of [0, -1, 65_536, 1.5, Number.NaN]) {
    assert.throws(() => chunkFile(data, bad), /block size/i);
  }
  assert.equal(chunkFile(data, 1).leafCount, 4);
  assert.equal(chunkFile(data, MAX_BLOCK_SIZE).leafCount, 1);
});

test("the input is copied, not aliased", () => {
  const data = pattern(4);
  const file = chunkFile(data, 2);
  data[0] = 0xff;
  assert.notEqual(file.blocks[0][0], 0xff);
});
