import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import { chunkFile } from "../../makhzan/src/chunk.ts";
import { buildTree } from "../../makhzan/src/merkle.ts";
import { verifyFileTool } from "../src/tools/verifyFile.ts";
import { CONTRACT, fakeReads } from "./helpers.ts";
import type { DealSnapshot } from "../src/reads.ts";

const BLOCK = 1024;

function fixture(): { dir: string; path: string; bytes: Uint8Array; tree: ReturnType<typeof buildTree> } {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-mcp-"));
  const bytes = new Uint8Array(3 * BLOCK + 100);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const path = join(dir, "fixture.bin");
  writeFileSync(path, bytes);
  const tree = buildTree(chunkFile(bytes, BLOCK).blocks);
  return { dir, path, bytes, tree };
}

function dealFor(tree: ReturnType<typeof buildTree>, size: number, leafCount: number): Partial<DealSnapshot> {
  return { root: tree.root, size, leafCount };
}

function readsWith(deal: Partial<DealSnapshot>) {
  return fakeReads({
    deal: async (id) => ({
      id,
      owner: "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
      startBlock: 1,
      endBlock: 100,
      providerId: 1,
      flags: 0,
      root: `0x${"00".repeat(32)}`,
      leafCount: 0,
      size: 0,
      price: 0n,
      claimed: 0n,
      ...deal,
    }),
  });
}

test("verify_file matches a file whose Merkle root equals the on-chain root", async () => {
  const { dir, path, bytes, tree } = fixture();
  try {
    const result = await verifyFileTool(
      readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
      { dealId: 2, path },
      { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
    );
    assert.match(result.text, /^\[MEASURED\] makhzan_verify_file — deal 2/);
    assert.match(result.text, /MATCH/);
    assert.equal(result.facts.match, true);
    assert.equal(result.facts.firstBadBlock, null);
    assert.equal(result.facts.bytes, bytes.length);
    assert.equal(result.facts.leafCount, tree.leaves.length);
    assert.equal(result.facts.onChainRoot, tree.root);
    assert.equal(result.facts.rebuiltRoot, tree.root);
    assert.match(String(result.facts.sha256), /^0x[0-9a-f]{64}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file names the first bad block when a reference copy localises it", async () => {
  const { dir, path, bytes, tree } = fixture();
  try {
    const reference = join(dir, "original.bin");
    writeFileSync(reference, bytes);
    const tampered = Uint8Array.from(bytes);
    tampered[BLOCK + 7] ^= 0x01; // inside block 1
    writeFileSync(path, tampered);

    const result = await verifyFileTool(
      readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
      { dealId: 2, path, referencePath: reference },
      { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
    );
    assert.equal(result.facts.match, false);
    assert.equal(result.facts.firstBadBlock, 1);
    assert.match(result.text, /MISMATCH/);
    assert.match(result.text, /first block that does not match the committed root: 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file refuses to guess a block from the chain root alone, and says why", async () => {
  const { dir, path, bytes, tree } = fixture();
  try {
    const tampered = Uint8Array.from(bytes);
    tampered[BLOCK + 7] ^= 0x01;
    writeFileSync(path, tampered);

    const result = await verifyFileTool(
      readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
      { dealId: 2, path },
      { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
    );
    assert.equal(result.facts.match, false);
    assert.equal(result.facts.firstBadBlock, null);
    assert.match(result.text, /MISMATCH/);
    assert.match(result.text, /cannot be named/);
    assert.doesNotMatch(result.text, /first block that does not match/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file refuses a reference file that does not hash to the committed root", async () => {
  const { dir, path, bytes, tree } = fixture();
  try {
    const other = join(dir, "other.bin");
    const otherBytes = Uint8Array.from(bytes);
    otherBytes[0] ^= 0xff;
    writeFileSync(other, otherBytes);
    // The checked file must also differ, otherwise there is no mismatch to localise.
    writeFileSync(path, otherBytes);
    await assert.rejects(
      verifyFileTool(
        readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
        { dealId: 2, path, referencePath: other },
        { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
      ),
      /cannot be used to locate the difference/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file refuses a file whose size is not the deal size", async () => {
  const { dir, path, tree } = fixture();
  try {
    await assert.rejects(
      verifyFileTool(
        readsWith(dealFor(tree, 9_999, tree.leaves.length)),
        { dealId: 2, path },
        { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
      ),
      /size/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file refuses when the block size does not reproduce the deal leaf count", async () => {
  const { dir, path, bytes, tree } = fixture();
  try {
    await assert.rejects(
      verifyFileTool(
        readsWith(dealFor(tree, bytes.length, tree.leaves.length + 1)),
        { dealId: 2, path },
        { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
      ),
      /leaf count/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file refuses a missing path instead of returning a verdict", async () => {
  const { dir, tree } = fixture();
  try {
    await assert.rejects(
      verifyFileTool(
        readsWith(dealFor(tree, 100, 1)),
        { dealId: 2, path: join(dir, "nope.bin") },
        { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
      ),
      /cannot read/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file accepts a path relative to MAKHZAN_VERIFY_DIR", async () => {
  const { dir, bytes, tree } = fixture();
  try {
    const result = await verifyFileTool(
      readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
      { dealId: 2, path: "fixture.bin" },
      { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
    );
    assert.equal(result.facts.match, true);
    assert.match(result.text, /MATCH/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file accepts a symlink that stays inside MAKHZAN_VERIFY_DIR", async () => {
  const { dir, path, bytes, tree } = fixture();
  try {
    const alias = join(dir, "alias.bin");
    symlinkSync(path, alias);
    const result = await verifyFileTool(
      readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
      { dealId: 2, path: alias },
      { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
    );
    assert.equal(result.facts.match, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify_file refuses ../ that escapes MAKHZAN_VERIFY_DIR", async () => {
  const { dir, bytes, tree } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "makhzan-outside-"));
  try {
    const escaped = join(outside, "escape.bin");
    writeFileSync(escaped, bytes);
    const escape = relative(dir, escaped);
    assert.match(escape, /^\.\.\//, "the fixture must really leave the folder");
    for (const candidate of [escape, escaped]) {
      await assert.rejects(
        verifyFileTool(
          readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
          { dealId: 2, path: candidate },
          { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
        ),
        /outside/,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("verify_file refuses an absolute path outside MAKHZAN_VERIFY_DIR and names the setting", async () => {
  const { dir, bytes, tree } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "makhzan-outside-"));
  try {
    const escaped = join(outside, "escape.bin");
    writeFileSync(escaped, bytes);
    await assert.rejects(
      verifyFileTool(
        readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
        { dealId: 2, path: escaped },
        { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
      ),
      /MAKHZAN_VERIFY_DIR/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("verify_file refuses a symlink inside the folder that points outside it", async () => {
  const { dir, bytes, tree } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "makhzan-outside-"));
  try {
    const escaped = join(outside, "escape.bin");
    writeFileSync(escaped, bytes);
    const link = join(dir, "link.bin");
    symlinkSync(escaped, link);
    await assert.rejects(
      verifyFileTool(
        readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
        { dealId: 2, path: link },
        { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
      ),
      /outside/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("verify_file refuses a symlinked folder that leads outside", async () => {
  const { dir, bytes, tree } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "makhzan-outside-"));
  try {
    writeFileSync(join(outside, "escape.bin"), bytes);
    symlinkSync(outside, join(dir, "outdir"));
    await assert.rejects(
      verifyFileTool(
        readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
        { dealId: 2, path: join("outdir", "escape.bin") },
        { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
      ),
      /outside/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("verify_file applies the same rule to referencePath", async () => {
  const { dir, path, bytes, tree } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "makhzan-outside-"));
  try {
    const reference = join(outside, "original.bin");
    writeFileSync(reference, bytes);
    const tampered = Uint8Array.from(bytes);
    tampered[BLOCK + 7] ^= 0x01;
    writeFileSync(path, tampered);
    await assert.rejects(
      verifyFileTool(
        readsWith(dealFor(tree, bytes.length, tree.leaves.length)),
        { dealId: 2, path, referencePath: reference },
        { contract: CONTRACT, blockSize: BLOCK, verifyDir: dir },
      ),
      /referencePath/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
