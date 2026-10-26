#!/usr/bin/env node
/**
 * Recomputes both committed samples with the *shared* Merkle module from
 * `apps/makhzan/src/merkle.ts` (the same file the browser imports through the Vite alias).
 *
 * - `demo-8k.bin`: the deterministic 8 KiB golden vector.
 * - `demo-1mib.bin`: the exact 1 MiB file deals 1 and 2 committed on Portaldot. It is random, so it
 *   cannot be regenerated from a seed; this check pins its bytes, sha256 and root instead.
 *
 * This is the build-time half of the parity claim: the CLI, the app and this check use one module.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree } from "../../makhzan/src/merkle.ts";
import { SAMPLE } from "../src/data/sample.ts";

const EXPECTED_ROOT = "0xd6bcfc4d0c933f0680ec2e7b1c0ea8aecba797de45bf726ae0ca4c8c286325b7";
const EXPECTED_SIZE = 8192;
const BLOCK_SIZE = 1024;

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function treeOf(bytes) {
  const leaves = [];
  for (let offset = 0; offset + BLOCK_SIZE <= bytes.length; offset += BLOCK_SIZE) {
    leaves.push(new Uint8Array(bytes.subarray(offset, offset + BLOCK_SIZE)));
  }
  return { leaves, root: leaves.length > 0 ? buildTree(leaves).root : "0x" };
}

const small = readFileSync(join(appRoot, "public/samples/demo-8k.bin"));
if (small.length !== EXPECTED_SIZE) problems.push(`sample is ${small.length} bytes, expected ${EXPECTED_SIZE}`);
const smallTree = treeOf(small);
if (smallTree.leaves.length !== 8) problems.push(`sample splits into ${smallTree.leaves.length} blocks, expected 8`);
if (smallTree.root !== EXPECTED_ROOT) problems.push(`root ${smallTree.root} does not match the committed 8 KiB root`);

const deal = readFileSync(join(appRoot, "public/samples/demo-1mib.bin"));
const dealTree = treeOf(deal);
const dealSha256 = `0x${createHash("sha256").update(deal).digest("hex")}`;
if (deal.length !== SAMPLE.size) problems.push(`deal sample is ${deal.length} bytes, page says ${SAMPLE.size}`);
if (dealTree.leaves.length !== SAMPLE.blockCount) {
  problems.push(`deal sample splits into ${dealTree.leaves.length} blocks, page says ${SAMPLE.blockCount}`);
}
if (dealSha256 !== SAMPLE.sha256) problems.push(`deal sha256 ${dealSha256} does not match the page's ${SAMPLE.sha256}`);
if (dealTree.root !== SAMPLE.root) problems.push(`deal root ${dealTree.root} does not match the page's ${SAMPLE.root}`);
if (SAMPLE.url !== "/samples/demo-1mib.bin") problems.push(`sample url ${SAMPLE.url} does not point at the served file`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(
  `sample OK: ${small.length} bytes, ${smallTree.leaves.length} blocks, root ${smallTree.root}; ` +
    `deal sample OK: ${deal.length} bytes, ${dealTree.leaves.length} blocks, sha256 ${dealSha256}, root ${dealTree.root}`,
);
