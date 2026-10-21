#!/usr/bin/env node
/**
 * Shared Merkle golden vector generator (T007).
 *
 * One run writes byte-identical copies to:
 *   packages/merkle-vectors/vectors.json
 *   contracts/test/fixtures/vectors.json
 *
 * `--check` regenerates in memory and compares both files against it, so the two
 * copies cannot drift and neither can be edited by hand.
 *
 * Schema, per leaf count:
 *   leaves        every block, in order
 *   leafHashes    leafHash(block) for every block
 *   root          the promoted-pairing root
 *   paths         every index's sibling list, bottom-up (explicit, readable)
 *   pathLengths   path length per index
 *   siblingHashes every path concatenated in index order (flat, Solidity-friendly)
 */
import { createRequire } from "node:module";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../apps/makhzan/package.json", import.meta.url));
const { keccak256, bytesToHex } = require("viem");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUTPUTS = [
  join(HERE, "vectors.json"),
  join(REPO, "contracts", "test", "fixtures", "vectors.json"),
];
const LEAF_COUNTS = [1, 3, 7, 1000];
const BLOCK_SIZE = 32;
const PREFIX_LEAF = Uint8Array.of(0x00);
const PREFIX_NODE = Uint8Array.of(0x01);

/** Deterministic block bytes: unique per (leafCount, index), no RNG. */
function blockBytes(leafCount, index) {
  const out = new Uint8Array(BLOCK_SIZE);
  for (let j = 0; j < BLOCK_SIZE; j += 1) {
    out[j] = (index * 31 + j * 17 + leafCount) & 0xff;
  }
  return out;
}

function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function leafHash(bytes) {
  return keccak256(concatBytes(PREFIX_LEAF, bytes));
}

function nodeHash(left, right) {
  return keccak256(concatBytes(PREFIX_NODE, hexBytes(left), hexBytes(right)));
}

function hexBytes(hex) {
  return Uint8Array.from(Buffer.from(hex.slice(2), "hex"));
}

function nextLevel(level) {
  const next = [];
  for (let i = 0; i < level.length; i += 2) {
    if (i + 1 < level.length) next.push(nodeHash(level[i], level[i + 1]));
    else next.push(level[i]); // odd node promoted, no sibling
  }
  return next;
}

function buildVector(leafCount) {
  const leaves = [];
  const leafHashes = [];
  for (let i = 0; i < leafCount; i += 1) {
    const bytes = blockBytes(leafCount, i);
    leaves.push(bytesToHex(bytes));
    leafHashes.push(leafHash(bytes));
  }

  const paths = [];
  const pathLengths = [];
  const siblingHashes = [];
  for (let index = 0; index < leafCount; index += 1) {
    let level = leafHashes.slice();
    let idx = index;
    let count = leafCount;
    const path = [];
    while (count > 1) {
      if (count % 2 === 1 && idx === count - 1) {
        // promoted: no sibling
      } else {
        const sibling = level[idx ^ 1];
        path.push(sibling);
      }
      idx = Math.floor(idx / 2);
      count = Math.floor((count + 1) / 2);
      level = nextLevel(level);
    }
    paths.push(path);
    pathLengths.push(path.length);
    siblingHashes.push(...path);
  }

  let rootLevel = leafHashes.slice();
  while (rootLevel.length > 1) rootLevel = nextLevel(rootLevel);

  return {
    leafCount,
    size: leafCount * BLOCK_SIZE,
    blockSize: BLOCK_SIZE,
    leaves,
    leafHashes,
    root: rootLevel[0],
    paths,
    pathLengths,
    siblingHashes,
  };
}

function generate() {
  const vectors = {};
  for (const leafCount of LEAF_COUNTS) {
    vectors[`leafCount${leafCount}`] = buildVector(leafCount);
  }
  return `${JSON.stringify({ spec: "makhzan-merkle-v1", vectors }, null, 2)}\n`;
}

function writeAtomic(path, text) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const expected = generate();

if (process.argv.includes("--check")) {
  let failed = false;
  for (const path of OUTPUTS) {
    let actual;
    try {
      actual = readFileSync(path, "utf8");
    } catch (error) {
      console.error(`MISSING ${path}: ${error.message}`);
      failed = true;
      continue;
    }
    if (actual !== expected) {
      console.error(`DRIFT ${path}: differs from a fresh generation`);
      failed = true;
    } else {
      console.log(`ok ${path}`);
    }
  }
  if (failed) {
    console.error("golden vector check FAILED");
    process.exit(1);
  }
  console.log("golden vector check passed");
} else {
  for (const path of OUTPUTS) {
    writeAtomic(path, expected);
    console.log(`wrote ${path} (${Buffer.byteLength(expected)} bytes)`);
  }
}
