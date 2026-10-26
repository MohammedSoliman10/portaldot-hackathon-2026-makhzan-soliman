import { chunkFile } from "@makhzan/chunk";
import { buildTreeFromLeafHashes, leafHash, type Hex } from "@makhzan/merkle";

/**
 * The browser half of the verifier.
 *
 * The split comes from the shared chunker and the tree from the shared Merkle module, so the page
 * cannot drift from the contract: no hashing rule is re-implemented here. Hashing is done in chunks
 * with an explicit yield, so a large file updates the progress bar instead of freezing the tab.
 */

export interface FileTreeOptions {
  blockSize?: number;
  /** Blocks hashed between two yields to the event loop. */
  chunkBlocks?: number;
  onProgress?: (done: number, total: number, stage: "hashing" | "levels") => void;
  /** Injectable so a test can hold the build mid-way; defaults to a macrotask. */
  yieldTo?: () => Promise<void>;
}

export interface FileTree {
  root: Hex;
  leafHashes: Hex[];
  levels: Hex[][];
  blockSize: number;
  blockCount: number;
  size: number;
}

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function buildFileTree(bytes: Uint8Array, options: FileTreeOptions = {}): Promise<FileTree> {
  const blockSize = options.blockSize ?? 1024;
  const chunkBlocks = Math.max(1, options.chunkBlocks ?? 64);
  const yieldTo = options.yieldTo ?? macrotask;
  const { size, leafCount, blocks } = chunkFile(bytes, blockSize);

  const leafHashes: Hex[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    leafHashes.push(leafHash(blocks[index]!));
    const done = index + 1;
    if (done % chunkBlocks === 0 || done === blocks.length) {
      options.onProgress?.(done, leafCount, "hashing");
      if (done < blocks.length) await yieldTo();
    }
  }

  options.onProgress?.(leafCount, leafCount, "levels");
  const tree = buildTreeFromLeafHashes(leafHashes);
  return { ...tree, blockSize, blockCount: leafCount, size };
}

/** Index of the first leaf whose hash differs, or null when both lists agree. */
export function firstMismatchingBlock(left: readonly Hex[], right: readonly Hex[]): number | null {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return null;
}

/** A copy of one block, so a caller can inspect or tamper with it without touching the file. */
export function blockAt(bytes: Uint8Array, blockSize: number, index: number): Uint8Array {
  return Uint8Array.from(bytes.subarray(index * blockSize, Math.min((index + 1) * blockSize, bytes.length)));
}
