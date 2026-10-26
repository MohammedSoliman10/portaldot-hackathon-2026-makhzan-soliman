import type { ConfigInfo, Hex } from "./schema";

export type PeekConfig = Omit<ConfigInfo, "slot0">;

/**
 * The single decoder for packed storage slot 0.
 *
 * Solidity packs from the least-significant end, so the first declared field
 * (`challengeWindow`, uint32) sits in the last four bytes of the word and the layout is read
 * right-to-left. Two leading bytes are padding. Layout is normative in
 * `specs/002-core-storage-proofs/contracts/storage-layout.md`; the golden test pins it.
 */
export function decodeSlot0(value: Hex): PeekConfig {
  const digits = value.startsWith("0x") ? value.slice(2) : "";
  if (!/^[0-9a-fA-F]*$/.test(digits) || digits.length % 2 !== 0) {
    throw new Error("slot0: must be a hex string with whole bytes");
  }
  const bytes = Uint8Array.from(digits.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  if (bytes.length !== 32) throw new Error("slot0: must be 32 bytes");

  const at = (start: number, length: number): bigint =>
    bytes.subarray(start, start + length).reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

  return {
    challengeWindowBlocks: Number(at(28, 4)),
    challengeBlockSize: Number(at(26, 2)),
    slashBps: Number(at(24, 2)),
    minBondUnits: at(16, 8).toString(),
    nextDealId: Number(at(12, 4)),
    providerCount: Number(at(10, 2)),
    minDurationBlocks: Number(at(6, 4)),
    maxDurationBlocks: Number(at(2, 4)),
  };
}
