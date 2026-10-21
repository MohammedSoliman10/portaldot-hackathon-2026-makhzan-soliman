/**
 * Merkle tree, path and verification, matching contracts/merkle.md.
 * T012 provides the signatures; T013 implements them.
 */
export type Hex = `0x${string}`;

export interface MerkleTree {
  leaves: Uint8Array[];
  leafHashes: Hex[];
  levels: Hex[][];
  root: Hex;
}

export function leafHash(data: Uint8Array): Hex {
  data;
  throw new Error("not implemented");
}

export function nodeHash(left: Hex, right: Hex): Hex {
  left;
  right;
  throw new Error("not implemented");
}

export function buildTree(leaves: Uint8Array[]): MerkleTree {
  leaves;
  throw new Error("not implemented");
}

export function getPath(tree: MerkleTree, index: number): Hex[] {
  tree;
  index;
  throw new Error("not implemented");
}

export function verify(
  root: Hex,
  data: Uint8Array,
  index: number,
  leafCount: number,
  path: Hex[],
): boolean {
  root;
  data;
  index;
  leafCount;
  path;
  throw new Error("not implemented");
}
