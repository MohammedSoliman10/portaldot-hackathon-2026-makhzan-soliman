/**
 * `makhzan_verify_file(dealId, path)`: hash a local file into the deal's blocks, rebuild the Merkle
 * root, and compare it with the root the chain holds.
 *
 * The chunker and the tree come from `apps/makhzan/src/{chunk,merkle}.ts`, the same modules the
 * browser verifier and the contract's tests use, so the hashing rule cannot drift here.
 *
 * What this can and cannot say: the deal commits a root and a leaf count, not the blocks. Equal roots
 * prove the file is the committed content. Different roots prove it is not — but the chain holds no
 * per-block hashes, so from the chain alone no single block can be named, and this tool does not
 * guess. When the caller can supply a second copy that *does* hash to the committed root
 * (`referencePath`), the first differing block is named: that comparison is local and exact.
 */
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Hex } from "viem";
import { chunkFile } from "../../../makhzan/src/chunk.ts";
import { buildTree } from "../../../makhzan/src/merkle.ts";
import { formatCount } from "../format.ts";
import type { Reads } from "../reads.ts";
import type { ToolResult } from "../result.ts";

function sha256(bytes: Uint8Array): Hex {
  return `0x${createHash("sha256").update(bytes).digest("hex")}` as Hex;
}

/** The folder `MAKHZAN_VERIFY_DIR` names, both as written and with symlinks followed. */
interface Scope {
  lexical: string;
  real: string;
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function outside(label: string, raw: string, root: string): Error {
  return new Error(
    `${label} "${raw}" is outside the folder this server may read (MAKHZAN_VERIFY_DIR = ${root}). ` +
      "The path is resolved and symlinks are followed before the check, so \"..\", an absolute path outside " +
      "that folder and a symlink that points outside are all refused. Move the file into the folder, or set " +
      "MAKHZAN_VERIFY_DIR to a folder that contains it.",
  );
}

async function resolveScope(dir: string): Promise<Scope> {
  const lexical = resolve(dir);
  let real: string;
  try {
    real = await realpath(lexical);
  } catch (error) {
    throw new Error(
      `MAKHZAN_VERIFY_DIR (${lexical}) is not a folder this server can read: ${(error as Error).message}`,
    );
  }
  if (!(await stat(real)).isDirectory()) {
    throw new Error(`MAKHZAN_VERIFY_DIR (${lexical}) is not a folder, so verify_file has nothing it may read`);
  }
  return { lexical, real };
}

/**
 * Resolve one argument the same way for `path` and `referencePath`: a relative path is relative to
 * MAKHZAN_VERIFY_DIR, the lexical result must be inside the folder (so `../` is refused even when the
 * target does not exist), and the real path — symlinks followed — must be inside too.
 */
async function within(scope: Scope, raw: string, label: string): Promise<string> {
  const lexical = resolve(scope.lexical, raw);
  if (!isInside(scope.lexical, lexical)) throw outside(label, raw, scope.lexical);

  let real: string;
  try {
    real = await realpath(lexical);
  } catch (error) {
    const prefix = label === "referencePath" ? "cannot read reference" : "cannot read";
    throw new Error(`${prefix} ${raw}: ${(error as Error).message}`);
  }
  if (!isInside(scope.real, real)) throw outside(label, raw, scope.lexical);
  return real;
}

/** Lowest index whose leaf hash differs, or null when the two lists agree. */
function firstMismatchingBlock(left: readonly Hex[], right: readonly Hex[]): number | null {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return null;
}

export async function verifyFileTool(
  reads: Reads,
  args: { dealId: number; path: string; referencePath?: string },
  ctx: { contract: Hex; blockSize: number; verifyDir: string },
): Promise<ToolResult> {
  const { dealId, path } = args;
  // Scope first: a refused path must not cost an RPC call or a byte read.
  const scope = await resolveScope(ctx.verifyDir);
  const file = await within(scope, path, "path");
  const deal = await reads.deal(dealId);

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file));
  } catch (error) {
    throw new Error(`cannot read ${path}: ${(error as Error).message}`);
  }

  let chunked: ReturnType<typeof chunkFile>;
  try {
    chunked = chunkFile(bytes, ctx.blockSize);
  } catch (error) {
    throw new Error(`cannot chunk ${path}: ${(error as Error).message}`);
  }

  if (chunked.leafCount !== deal.leafCount) {
    // The earliest block the deal does not commit to, when the file simply has more of them.
    const extra = Math.min(chunked.leafCount, deal.leafCount);
    throw new Error(
      `block size ${ctx.blockSize} gives leaf count ${chunked.leafCount} for a ${formatCount(bytes.length)} byte file, ` +
        `but deal ${dealId} commits ${deal.leafCount} leaves. ` +
        `The file is not the committed object${chunked.leafCount > deal.leafCount ? ` (first block the deal does not commit to: ${extra})` : ""}.`,
    );
  }
  if (bytes.length !== deal.size) {
    throw new Error(
      `file size ${formatCount(bytes.length)} B does not match deal ${dealId} size ${formatCount(deal.size)} B`,
    );
  }

  const tree = buildTree(chunked.blocks);
  const rebuilt = tree.root;
  const match = rebuilt.toLowerCase() === deal.root.toLowerCase();
  const lastBlock = bytes.length - (deal.leafCount - 1) * ctx.blockSize;
  const digest = sha256(bytes);

  let firstBadBlock: number | null = null;
  let localised: string | null = null;
  if (!match && args.referencePath) {
    const referenceFile = await within(scope, args.referencePath, "referencePath");
    let referenceBytes: Uint8Array;
    try {
      referenceBytes = new Uint8Array(await readFile(referenceFile));
    } catch (error) {
      throw new Error(`cannot read reference ${args.referencePath}: ${(error as Error).message}`);
    }
    const referenceTree = buildTree(chunkFile(referenceBytes, ctx.blockSize).blocks);
    if (referenceTree.root.toLowerCase() !== deal.root.toLowerCase()) {
      throw new Error(
        `reference file ${args.referencePath} hashes to ${referenceTree.root}, not to the root deal ${dealId} commits, ` +
          "so it cannot be used to locate the difference",
      );
    }
    firstBadBlock = firstMismatchingBlock(tree.leafHashes, referenceTree.leafHashes);
    localised =
      firstBadBlock === null
        ? null
        : `first block that does not match the committed root: ${firstBadBlock} ` +
          `(located by comparing with ${args.referencePath}, which does hash to the committed root)`;
  }

  const verdict = match
    ? `MATCH: the file hashes to the root deal ${dealId} commits.`
    : [
        `MISMATCH: the rebuilt root does not equal the root deal ${dealId} commits.`,
        localised ??
          [
            "The deal stores the root and the leaf count, not the blocks, so from chain data alone the",
            "first differing block cannot be named. Pass referencePath with a copy that does hash to the",
            "committed root to localise it exactly.",
          ].join("\n"),
      ].join("\n");

  const text = [
    `[MEASURED] makhzan_verify_file — deal ${dealId}`,
    `file ${path}`,
    `size ${formatCount(bytes.length)} B, sha256 ${digest}`,
    `blocks ${formatCount(deal.leafCount)} × ${formatCount(ctx.blockSize)} B (last block ${formatCount(lastBlock)} B)`,
    `rebuilt root ${rebuilt}`,
    `on-chain root ${deal.root}`,
    verdict,
    "label: MEASURED for the roots and the digest; the hashing rule is the contract's (0x00 leaf, 0x01 node).",
  ].join("\n");

  return {
    text,
    facts: {
      label: "MEASURED",
      dealId,
      path,
      referencePath: args.referencePath ?? null,
      bytes: bytes.length,
      sha256: digest,
      blockSize: ctx.blockSize,
      leafCount: deal.leafCount,
      onChainRoot: deal.root,
      rebuiltRoot: rebuilt,
      match,
      firstBadBlock,
    },
  };
}
