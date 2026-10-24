/**
 * Read-only file retrieval. The provider serves the stored blocks and their Merkle paths; the client
 * trusts only the on-chain root and checks every block before writing a byte.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hexToBytes } from "viem";
import { buildTree, getPath, verify, type Hex } from "./merkle.ts";
import { blockPathFor, type StateFile } from "./state.ts";

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEXBYTES = /^0x([0-9a-fA-F]{2})*$/;

export interface BlockProof {
  index: number;
  data: Hex;
  path: Hex[];
}

export interface FilePayload {
  root: Hex;
  size: number;
  leafCount: number;
  blockSize: number;
  blocks: BlockProof[];
}

export interface RetrievalExpectation {
  root: Hex;
  size: number;
  leafCount: number;
  blockSize: number;
}

export interface VerifiedFile {
  bytes: Uint8Array;
  sha256: string;
  blockCount: number;
}

/** Builds the provider-side payload from the state store; missing blocks are an error, never a gap. */
export function buildFilePayload(
  state: StateFile,
  stateFile: string,
  root: string,
  blockSize: number,
): FilePayload {
  const key = Object.keys(state.files).find((candidate) => candidate.toLowerCase() === root.toLowerCase());
  if (!key) throw new Error(`root ${root} is not in the provider store`);
  const entry = state.files[key];
  if (entry.size <= 0 || entry.leafCount <= 0) throw new Error(`root ${key} has no stored blocks`);

  const blocks: Uint8Array[] = [];
  for (let index = 0; index < entry.leafCount; index++) {
    const path = blockPathFor(stateFile, key, index);
    if (!existsSync(path)) throw new Error(`root ${key} is missing block ${index}`);
    blocks.push(new Uint8Array(readFileSync(path)));
  }
  const tree = buildTree(blocks);
  if (tree.root.toLowerCase() !== key.toLowerCase()) {
    throw new Error(`stored blocks do not match root ${key}`);
  }
  return {
    root: key as Hex,
    size: entry.size,
    leafCount: entry.leafCount,
    blockSize,
    blocks: blocks.map((data, index) => ({
      index,
      data: `0x${Buffer.from(data).toString("hex")}` as Hex,
      path: getPath(tree, index),
    })),
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Verifies every block against the expected on-chain root. The provider's declared root, size and
 * leaf count are checked against the chain values; a single flipped byte or path hash is rejected.
 */
export function verifyFile(payload: FilePayload, expected: RetrievalExpectation): VerifiedFile {
  if (!expected || !HEX32.test(expected.root)) throw new Error("BadExpectation: expected root is not 32 bytes");
  if (!Number.isInteger(expected.size) || expected.size <= 0) throw new Error("BadExpectation: bad size");
  if (!Number.isInteger(expected.leafCount) || expected.leafCount <= 0) throw new Error("BadExpectation: bad leaf count");
  if (!Number.isInteger(expected.blockSize) || expected.blockSize <= 0) {
    throw new Error("BadExpectation: bad block size");
  }
  if (expected.leafCount !== Math.ceil(expected.size / expected.blockSize)) {
    throw new Error("BadExpectation: leaf count does not match size and block size");
  }
  if (typeof payload !== "object" || payload === null) throw new Error("BadPayload: payload is not an object");
  if (typeof payload.root !== "string" || !HEX32.test(payload.root)) {
    throw new Error("BadPayload: root is not 32 bytes");
  }
  if (payload.root.toLowerCase() !== expected.root.toLowerCase()) {
    throw new Error(`ProofRejected: provider root ${payload.root} does not match expected root ${expected.root}`);
  }
  if (payload.size !== expected.size) throw new Error(`ProofRejected: size ${payload.size} does not match ${expected.size}`);
  if (payload.leafCount !== expected.leafCount) {
    throw new Error(`ProofRejected: leaf count ${payload.leafCount} does not match ${expected.leafCount}`);
  }
  if (payload.blockSize !== expected.blockSize) {
    throw new Error(`ProofRejected: block size ${payload.blockSize} does not match ${expected.blockSize}`);
  }
  if (!Array.isArray(payload.blocks) || payload.blocks.length !== expected.leafCount) {
    throw new Error(`ProofRejected: expected ${expected.leafCount} blocks, got ${payload.blocks?.length ?? 0}`);
  }

  const parts: Uint8Array[] = [];
  for (let index = 0; index < expected.leafCount; index++) {
    const block = payload.blocks[index];
    if (block.index !== index) throw new Error(`ProofRejected: block ${index} is out of order`);
    if (typeof block.data !== "string" || !HEXBYTES.test(block.data)) {
      throw new Error(`ProofRejected: block ${index} data is not bytes`);
    }
    const data = hexToBytes(block.data);
    const expectedLength =
      index === expected.leafCount - 1
        ? expected.size - (expected.leafCount - 1) * expected.blockSize
        : expected.blockSize;
    if (data.length !== expectedLength) {
      throw new Error(`ProofRejected: block ${index} has ${data.length} bytes, expected ${expectedLength}`);
    }
    if (!Array.isArray(block.path) || block.path.some((hash) => typeof hash !== "string" || !HEX32.test(hash))) {
      throw new Error(`ProofRejected: block ${index} path is malformed`);
    }
    if (!verify(expected.root, data, index, expected.leafCount, block.path)) {
      throw new Error(`ProofRejected: block ${index} does not match the expected root ${expected.root}`);
    }
    parts.push(data);
  }

  const bytes = new Uint8Array(expected.size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  if (offset !== expected.size) throw new Error(`ProofRejected: reconstructed ${offset} bytes, expected ${expected.size}`);
  return { bytes, sha256: sha256Hex(bytes), blockCount: expected.leafCount };
}
