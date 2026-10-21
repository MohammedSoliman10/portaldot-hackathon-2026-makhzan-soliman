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
export function chunkFile(_data: Uint8Array, _blockSize: number): ChunkedFile {
  throw new Error("not implemented");
}
