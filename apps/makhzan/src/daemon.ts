/**
 * Provider daemon. This file currently owns the loopback upload endpoint; the polling and
 * answer half is implemented by T046/T047 (still `not implemented` below).
 */
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { bytesToHex } from "viem";
import { buildTree, getPath } from "./merkle.ts";
import { blockPathFor, writeState, type StateFile } from "./state.ts";
import { UploadReceiver, type Acknowledgement } from "./upload.ts";

/** Loopback-only HTTP endpoint: POST /upload carries one validated envelope per request. */
export function startUploadServer(receiver: UploadReceiver, port = 0): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/upload") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 8_000_000) req.destroy();
      });
      req.on("end", () => {
        try {
          const ack: Acknowledgement | undefined = receiver.accept(JSON.parse(body));
          res.writeHead(ack ? 200 : 202, { "content-type": "application/json" });
          res.end(JSON.stringify(ack ?? { accepted: true }));
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/** T046/T047: the polling half. */
export interface ChainClient {
  challengeStateOf(dealId: number): Promise<{
    open: boolean;
    index: number;
    start: number;
    deadline: number;
    expectedPathLength: number;
  }>;
  answer(dealId: number, data: `0x${string}`, path: `0x${string}`[]): Promise<{ hash: `0x${string}` }>;
}

export interface PollContext {
  client: ChainClient;
  state: StateFile;
  stateFile: string;
  /** Deal ids to check even when the state has never heard of them. */
  dealIds?: number[];
  drill?: "wrong" | "skip";
}

export interface PollResult {
  answered: number[];
  skipped: number[];
  unanswerable: string[];
  unknownDeal: number[];
}

export async function pollOnce(ctx: PollContext): Promise<PollResult> {
  const result: PollResult = { answered: [], skipped: [], unanswerable: [], unknownDeal: [] };
  const ids = new Set<number>(Object.keys(ctx.state.deals).map(Number));
  for (const id of ctx.dealIds ?? []) ids.add(id);

  for (const dealId of [...ids].sort((a, b) => a - b)) {
    const challenge = await ctx.client.challengeStateOf(dealId);
    if (!challenge.open) continue;

    const deal = ctx.state.deals[String(dealId)];
    if (!deal) {
      result.unanswerable.push(`unanswerable: unknown deal ${dealId}`);
      result.unknownDeal.push(dealId);
      continue;
    }
    const handled = deal.lastChallenge;
    if (handled && handled.start === challenge.start && handled.status !== "pending") continue;
    if (!deal.root) {
      result.unanswerable.push(`unanswerable: deal ${dealId} has no committed root`);
      continue;
    }
    const entry = ctx.state.files[deal.root];
    if (!entry) {
      result.unanswerable.push(`unanswerable: deal ${dealId} root ${deal.root} is not in the store`);
      continue;
    }
    const blocks: Uint8Array[] = [];
    let missing = -1;
    for (let i = 0; i < entry.leafCount; i++) {
      const path = blockPathFor(ctx.stateFile, deal.root, i);
      if (!existsSync(path)) {
        missing = i;
        break;
      }
      blocks.push(new Uint8Array(readFileSync(path)));
    }
    if (missing >= 0) {
      result.unanswerable.push(`unanswerable: missing block ${missing} of deal ${dealId}`);
      continue;
    }
    const tree = buildTree(blocks);
    if (tree.root !== deal.root) {
      result.unanswerable.push(`unanswerable: stored blocks do not match root ${deal.root}`);
      continue;
    }
    if (challenge.index >= blocks.length) {
      result.unanswerable.push(`unanswerable: challenge index ${challenge.index} outside the stored tree`);
      continue;
    }
    const path = getPath(tree, challenge.index);
    if (path.length !== challenge.expectedPathLength) {
      result.unanswerable.push(
        `unanswerable: path length ${path.length} does not match expected ${challenge.expectedPathLength}`,
      );
      continue;
    }

    if (ctx.drill === "skip") {
      deal.lastChallenge = { index: challenge.index, start: challenge.start, status: "failed" };
      result.skipped.push(dealId);
      writeState(ctx.stateFile, ctx.state);
      continue;
    }

    let data = blocks[challenge.index];
    if (ctx.drill === "wrong") {
      data = Uint8Array.from(data);
      data[0] = data[0] ^ 0xff;
    }
    await ctx.client.answer(dealId, bytesToHex(data), path);
    deal.lastChallenge = {
      index: challenge.index,
      start: challenge.start,
      status: ctx.drill === "wrong" ? "failed" : "passed",
    };
    result.answered.push(dealId);
    writeState(ctx.stateFile, ctx.state);
  }
  return result;
}
