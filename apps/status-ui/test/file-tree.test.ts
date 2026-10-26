import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildFileTree, firstMismatchingBlock } from "../src/data/file-tree";

const SAMPLE = new Uint8Array(readFileSync(join(process.cwd(), "public/samples/demo-1mib.bin")));
const DEAL_ROOT = "0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7";
const EIGHT_K_ROOT = "0xd6bcfc4d0c933f0680ec2e7b1c0ea8aecba797de45bf726ae0ca4c8c286325b7";

describe("the browser tree", () => {
  it("reproduces the on-chain root of the 1 MiB deal file", async () => {
    const tree = await buildFileTree(SAMPLE);
    expect(tree.size).toBe(1048576);
    expect(tree.blockSize).toBe(1024);
    expect(tree.blockCount).toBe(1024);
    expect(tree.root).toBe(DEAL_ROOT);
  });

  it("reproduces the 8 KiB golden vector with the same module", async () => {
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), "public/samples/demo-8k.bin")));
    const tree = await buildFileTree(bytes);
    expect(tree.blockCount).toBe(8);
    expect(tree.root).toBe(EIGHT_K_ROOT);
  });

  it("reports progress in block order and yields to the event loop", async () => {
    const seen: number[] = [];
    const yieldTo = vi.fn(async () => {});
    const tree = await buildFileTree(SAMPLE, {
      chunkBlocks: 128,
      onProgress: (done) => seen.push(done),
      yieldTo,
    });
    expect(seen[0]).toBe(128);
    expect(seen.at(-1)).toBe(1024);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(yieldTo.mock.calls.length).toBeGreaterThanOrEqual(7);
    expect(tree.root).toBe(DEAL_ROOT);
  });

  it("locates the first block whose bytes changed, not just the root", async () => {
    const copy = Uint8Array.from(SAMPLE);
    const offset = copy.length - 1024;
    copy[offset] = (copy[offset] ?? 0) ^ 0xff;
    const original = await buildFileTree(SAMPLE);
    const tampered = await buildFileTree(copy);
    expect(firstMismatchingBlock(original.leafHashes, tampered.leafHashes)).toBe(1023);
    expect(tampered.root).not.toBe(original.root);
  });

  it("keeps the last short block as a short leaf, like the shared chunker", async () => {
    const tree = await buildFileTree(new Uint8Array(1500));
    expect(tree.blockCount).toBe(2);
    expect(tree.size).toBe(1500);
  });

  it("refuses an empty file with the chunker's own message", async () => {
    await expect(buildFileTree(new Uint8Array(0))).rejects.toThrow(/empty file/i);
  });
});
