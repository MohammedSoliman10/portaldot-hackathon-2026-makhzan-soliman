import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import { buildTree, buildTreeFromLeafHashes, getPath, leafHash, verify, type Hex } from "../src/merkle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS = join(HERE, "..", "..", "..", "packages", "merkle-vectors", "vectors.json");
const json = JSON.parse(readFileSync(VECTORS, "utf8"));

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.slice(2), "hex"));
}

const COUNTS = [1, 3, 7, 1000] as const;

test("builder matches every shared vector", () => {
  for (const count of COUNTS) {
    const vector = json.vectors[`leafCount${count}`];
    const leaves = (vector.leaves as string[]).map(bytes);
    const tree = buildTree(leaves);
    assert.equal(tree.root, vector.root, `root for ${count}`);
    assert.deepEqual(tree.leafHashes, vector.leafHashes, `leaf hashes for ${count}`);
    assert.equal(tree.leaves.length, count);
    assert.equal(leafHash(leaves[0]), vector.leafHashes[0], `leaf hash for ${count}`);
  }
});

test("building from leaf hashes gives the same root, levels and paths", () => {
  for (const count of COUNTS) {
    const vector = json.vectors[`leafCount${count}`];
    const leaves = (vector.leaves as string[]).map(bytes);
    const fromBytes = buildTree(leaves);
    const fromHashes = buildTreeFromLeafHashes(leaves.map(leafHash));
    assert.equal(fromHashes.root, fromBytes.root, `root for ${count}`);
    assert.deepEqual(fromHashes.levels, fromBytes.levels, `levels for ${count}`);
    for (let i = 0; i < count; i += 1) {
      assert.deepEqual(getPath(fromHashes, i), vector.paths[i], `path ${i} of ${count}`);
    }
  }
});

test("every shared path is reproduced and verifies", () => {  for (const count of COUNTS) {
    const vector = json.vectors[`leafCount${count}`];
    const leaves = (vector.leaves as string[]).map(bytes);
    const tree = buildTree(leaves);
    for (let i = 0; i < count; i += 1) {
      const path = getPath(tree, i);
      assert.deepEqual(path, vector.paths[i], `path ${i} of ${count}`);
      assert.equal(path.length, vector.pathLengths[i], `path length ${i} of ${count}`);
      assert.equal(verify(vector.root, leaves[i], i, count, path), true, `verify ${i} of ${count}`);
    }
  }
});

test("a path replayed at another index is rejected", () => {
  for (const count of [3, 7, 1000]) {
    const vector = json.vectors[`leafCount${count}`];
    const leaves = (vector.leaves as string[]).map(bytes);
    const tree = buildTree(leaves);
    for (let i = 0; i < count; i += 1) {
      const path = getPath(tree, i);
      for (const j of [0, 1, count - 1]) {
        if (j === i) continue;
        assert.equal(verify(vector.root, leaves[i], j, count, path), false, `replay ${i} at ${j}`);
      }
    }
  }
});

test("wrong bytes, wrong depth, reordered path and empty bytes are rejected", () => {
  const count = 7;
  const vector = json.vectors[`leafCount${count}`];
  const leaves = (vector.leaves as string[]).map(bytes);
  const tree = buildTree(leaves);
  const index = 3;
  const path = getPath(tree, index) as Hex[];
  const root = vector.root as Hex;

  const wrong = Uint8Array.from(leaves[index]);
  wrong[0] ^= 0xff;
  assert.equal(verify(root, wrong, index, count, path), false, "wrong bytes");

  assert.equal(verify(root, leaves[index], index, count, path.slice(0, -1)), false, "short path");
  assert.equal(
    verify(root, leaves[index], index, count, [...path, `0x${"00".repeat(32)}`]),
    false,
    "long path",
  );
  const swapped = [...path];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.equal(verify(root, leaves[index], index, count, swapped), false, "reordered path");
  assert.equal(verify(root, new Uint8Array(0), index, count, path), false, "empty bytes");
  assert.equal(verify(root, leaves[index], count, count, path), false, "index out of range");
});
