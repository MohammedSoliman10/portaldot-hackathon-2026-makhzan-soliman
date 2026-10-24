/** Challenge-block chunker shared by the CLI, the daemon and the tests. */
export const MIN_BLOCK_SIZE = 1;
export const MAX_BLOCK_SIZE = 65_535;

export interface ChunkedFile {
  blockSize: number;
  size: number;
  leafCount: number;
  blocks: Uint8Array[];
}

/** Splits a file into the challenge blocks committed by the deal. */
export function chunkFile(data: Uint8Array, blockSize: number): ChunkedFile {
  if (!Number.isInteger(blockSize) || blockSize < MIN_BLOCK_SIZE || blockSize > MAX_BLOCK_SIZE) {
    throw new Error(`block size must be an integer in ${MIN_BLOCK_SIZE}..${MAX_BLOCK_SIZE}, got ${blockSize}`);
  }
  if (data.length === 0) throw new Error("an empty file has no challenge blocks");
  const size = data.length;
  const leafCount = Math.ceil(size / blockSize);
  const blocks: Uint8Array[] = [];
  for (let i = 0; i < leafCount; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, size);
    blocks.push(Uint8Array.from(data.subarray(start, end)));
  }
  return { blockSize, size, leafCount, blocks };
}
