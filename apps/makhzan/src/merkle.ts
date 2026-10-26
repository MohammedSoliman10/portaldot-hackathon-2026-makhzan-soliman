/**
 * Merkle tree, path and verification, matching contracts/merkle.md.
 *
 *   leafHash(bytes)      = keccak256(0x00 || bytes)
 *   nodeHash(left,right) = keccak256(0x01 || left || right)
 *
 * Pairing promotes an odd last node unchanged; path directions come from the
 * index and the level width, never from the prover.
 */
import { bytesToHex, concatBytes, hexToBytes, keccak256 } from "viem";

export type Hex = `0x${string}`;

export interface MerkleLevels {
  leafHashes: Hex[];
  levels: Hex[][];
  root: Hex;
}

export interface MerkleTree extends MerkleLevels {
  leaves: Uint8Array[];
}

const LEAF_PREFIX = Uint8Array.of(0x00);
const NODE_PREFIX = Uint8Array.of(0x01);

export function leafHash(data: Uint8Array): Hex {
  return keccak256(concatBytes([LEAF_PREFIX, data]));
}

export function nodeHash(left: Hex, right: Hex): Hex {
  return keccak256(concatBytes([NODE_PREFIX, hexToBytes(left), hexToBytes(right)]));
}

export function buildTree(leaves: Uint8Array[]): MerkleTree {
  const leafHashes = leaves.map(leafHash);
  return { leaves: leaves.map((leaf) => Uint8Array.from(leaf)), ...buildTreeFromLeafHashes(leafHashes) };
}

/**
 * Builds the levels from already-hashed leaves.
 *
 * A browser that hashes blocks in chunks (so it can show progress and stay responsive) needs to
 * reach the root without hashing every leaf a second time. The pairing rule lives here once, so the
 * chunked builder and `buildTree` cannot disagree.
 */
export function buildTreeFromLeafHashes(leafHashes: Hex[]): MerkleLevels {
  if (leafHashes.length === 0) throw new Error("a tree needs at least one leaf");
  const levels: Hex[][] = [leafHashes.slice()];
  while (levels[levels.length - 1]!.length > 1) {
    const current = levels[levels.length - 1]!;
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? nodeHash(current[i]!, current[i + 1]!) : current[i]!);
    }
    levels.push(next);
  }
  return { leafHashes: levels[0]!, levels, root: levels[levels.length - 1]![0]! };
}

export function getPath(tree: MerkleLevels, index: number): Hex[] {
  const leafCount = tree.levels[0]!.length;
  if (!Number.isInteger(index) || index < 0 || index >= leafCount) {
    throw new Error(`index ${index} outside 0..${leafCount - 1}`);
  }
  const path: Hex[] = [];
  let idx = index;
  for (const level of tree.levels) {
    const count = level.length;
    if (count === 1) break;
    if (count % 2 === 1 && idx === count - 1) {
      // promoted: no sibling
    } else {
      path.push(level[idx ^ 1]!);
    }
    idx >>= 1;
  }
  return path;
}

export function verify(
  root: Hex,
  data: Uint8Array,
  index: number,
  leafCount: number,
  path: Hex[],
): boolean {
  if (leafCount === 0 || index < 0 || index >= leafCount) return false;
  if (data.length === 0) return false;
  let h = leafHash(data);
  let idx = index;
  let count = leafCount;
  let p = 0;
  while (count > 1) {
    if (count % 2 === 1 && idx === count - 1) {
      // promoted: no sibling consumed
    } else {
      if (p >= path.length) return false;
      const sibling = path[p]!;
      p += 1;
      h = idx % 2 === 1 ? nodeHash(sibling, h) : nodeHash(h, sibling);
    }
    idx = Math.floor(idx / 2);
    count = Math.floor((count + 1) / 2);
  }
  return p === path.length && h === root;
}

/** Hex helper kept here so callers do not import viem directly for this one case. */
export function bytesToHexString(data: Uint8Array): Hex {
  return bytesToHex(data);
}
