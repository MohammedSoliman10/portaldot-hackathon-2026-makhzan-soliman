#!/usr/bin/env node
/**
 * Recomputes the root of the committed 8 KiB sample with the *shared* Merkle module from
 * `apps/makhzan/src/merkle.ts` (the same file the browser imports through the Vite alias).
 *
 * This is the build-time half of the parity claim: the CLI, the app and this check use one module.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree } from "../../makhzan/src/merkle.ts";

const EXPECTED_ROOT = "0xd6bcfc4d0c933f0680ec2e7b1c0ea8aecba797de45bf726ae0ca4c8c286325b7";
const EXPECTED_SIZE = 8192;
const BLOCK_SIZE = 1024;

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bytes = readFileSync(join(appRoot, "public/samples/demo-8k.bin"));

const problems = [];
if (bytes.length !== EXPECTED_SIZE) problems.push(`sample is ${bytes.length} bytes, expected ${EXPECTED_SIZE}`);

const leaves = [];
for (let offset = 0; offset + BLOCK_SIZE <= bytes.length; offset += BLOCK_SIZE) {
  leaves.push(new Uint8Array(bytes.subarray(offset, offset + BLOCK_SIZE)));
}
if (leaves.length !== 8) problems.push(`sample splits into ${leaves.length} blocks, expected 8`);

const root = leaves.length > 0 ? buildTree(leaves).root : "0x";
if (root !== EXPECTED_ROOT) problems.push(`root ${root} does not match the committed deal root`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(`sample OK: ${bytes.length} bytes, ${leaves.length} blocks, root ${root}`);
