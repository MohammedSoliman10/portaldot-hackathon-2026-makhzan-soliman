/** Validated upload receiver: one block per request, acknowledged only when the file is complete. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hexToBytes } from "viem";
import { buildTree, type Hex } from "./merkle.ts";

export interface UploadConfig {
  blockSize: number;
  storeDir?: string;
}

export interface Acknowledgement {
  root: Hex;
  size: number;
  leafCount: number;
}

const FIELDS = ["root", "size", "leafCount", "blockSize", "index", "data"] as const;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const HEXBYTES = /^0x([0-9a-fA-F]{2})*$/;

interface Session {
  size: number;
  leafCount: number;
  blocks: (Uint8Array | undefined)[];
  received: number;
}

/** Rejects anything malformed with a verbatim reason; stores blocks under `<storeDir>/<root>/`. */
export class UploadReceiver {
  readonly #blockSize: number;
  readonly #storeDir?: string;
  readonly #sessions = new Map<Hex, Session>();

  constructor(config: UploadConfig) {
    this.#blockSize = config.blockSize;
    this.#storeDir = config.storeDir;
  }

  accept(envelope: unknown): Acknowledgement | undefined {
    if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
      throw new Error("envelope must be an object with exactly the documented fields");
    }
    const e = envelope as Record<string, unknown>;
    for (const key of Object.keys(e)) {
      if (!(FIELDS as readonly string[]).includes(key)) throw new Error(`unknown field '${key}'`);
    }
    for (const field of FIELDS) {
      if (!(field in e)) throw new Error(`missing field '${field}'`);
    }
    const { root, size, leafCount, blockSize, index, data } = e as {
      root: unknown; size: unknown; leafCount: unknown; blockSize: unknown; index: unknown; data: unknown;
    };
    if (typeof root !== "string" || !HEX32.test(root)) throw new Error("root must be 32 bytes of hex");
    if (typeof data !== "string" || !HEXBYTES.test(data)) throw new Error("data must be 0x-prefixed bytes");
    for (const [name, value] of [["size", size], ["leafCount", leafCount], ["blockSize", blockSize]] as const) {
      if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${name} must be a non-negative integer`);
    }
    if (!Number.isInteger(index)) throw new Error("index must be an integer");
    const sizeN = size as number;
    const leafCountN = leafCount as number;
    const blockSizeN = blockSize as number;
    const indexN = index as number;
    if (sizeN <= 0) throw new Error("size must be positive");
    if (blockSizeN !== this.#blockSize) {
      throw new Error(`block size ${blockSizeN} does not match ${this.#blockSize}`);
    }
    const expectedLeafCount = Math.ceil(sizeN / blockSizeN);
    if (leafCountN !== expectedLeafCount) {
      throw new Error(`leaf count ${leafCountN} does not match ceil(size/blockSize)=${expectedLeafCount}`);
    }
    if (indexN < 0 || indexN >= leafCountN) {
      throw new Error(`index ${indexN} is outside 0..${leafCountN - 1}`);
    }
    const expectedLength =
      indexN === leafCountN - 1 ? sizeN - (leafCountN - 1) * blockSizeN : blockSizeN;
    const bytes = hexToBytes(data as Hex);
    if (bytes.length !== expectedLength) {
      
      const unit = bytes.length === 1 ? "byte" : "bytes";
      throw new Error(`block ${indexN} has ${bytes.length} ${unit}, expected ${expectedLength}`);
    }

    const session = this.#sessions.get(root as Hex) ?? {
      size: sizeN,
      leafCount: leafCountN,
      blocks: new Array(leafCountN).fill(undefined) as (Uint8Array | undefined)[],
      received: 0,
    };
    if (indexN !== session.received) {
      throw new Error(`block ${indexN} arrived out of order, expected ${session.received}`);
    }
    if (session.size !== sizeN || session.leafCount !== leafCountN) {
      throw new Error("block disagrees with the size and leaf count of the same root");
    }
    session.blocks[indexN] = bytes;
    session.received += 1;
    this.#sessions.set(root as Hex, session);

    if (this.#storeDir) {
      const dir = join(this.#storeDir, root as string);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, String(indexN)), bytes);
    }

    if (session.received < session.leafCount) return undefined;
    const tree = buildTree(session.blocks as Uint8Array[]);
    if (tree.root !== root) {
      this.#sessions.delete(root as Hex);
      throw new Error(`declared root does not match the recomputed root ${tree.root}`);
    }
    this.#sessions.delete(root as Hex);
    return { root: root as Hex, size: sizeN, leafCount: leafCountN };
  }
}
