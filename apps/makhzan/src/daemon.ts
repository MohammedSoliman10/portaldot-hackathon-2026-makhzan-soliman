/**
 * Provider daemon. This file currently owns the loopback upload endpoint; the polling and
 * answer half is implemented by T046/T047 (still `not implemented` below).
 */
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { bytesToHex } from "viem";
import { buildTree, getPath } from "./merkle.ts";
import { blockPathFor, writeState, type ChallengeRecord, type StateFile } from "./state.ts";
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
export const MAX_ANSWER_ATTEMPTS = 3;

export interface ChainClient {
  /** Current block height, used for the deadline and for the record. */
  blockNumber(): Promise<number>;
  /** Provider bond of the deal, in native units, used to detect a slash. */
  bondOf(dealId: number): Promise<bigint>;
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
  passed: number[];
  failed: number[];
  skipped: number[];
  unanswerable: string[];
  unknownDeal: number[];
}

export async function pollOnce(ctx: PollContext): Promise<PollResult> {
  const result: PollResult = {
    answered: [], passed: [], failed: [], skipped: [], unanswerable: [], unknownDeal: [],
  };
  const ids = new Set<number>(Object.keys(ctx.state.deals).map(Number));
  for (const id of ctx.dealIds ?? []) ids.add(id);

  // One deal's failure must never stop the rest of the cycle (live RPC reliability ~95.5%).
  for (const dealId of [...ids].sort((a, b) => a - b)) {
    try {
      await pollDeal(ctx, dealId, result);
    } catch (err) {
      result.unanswerable.push(`unanswerable: deal ${dealId}: ${(err as Error).message}`);
      writeState(ctx.stateFile, ctx.state);
    }
  }
  return result;
}

async function pollDeal(ctx: PollContext, dealId: number, result: PollResult): Promise<void> {
  const challenge = await ctx.client.challengeStateOf(dealId);
  const deal = ctx.state.deals[String(dealId)];
  if (!deal) {
    result.unanswerable.push(`unanswerable: unknown deal ${dealId}`);
    result.unknownDeal.push(dealId);
    return;
  }
  const prev = deal.lastChallenge;
  // A closed challenge reports start 0, so the stored record is the only round identity left.
  const sameRound =
    prev !== undefined && (prev.start === challenge.start || (!challenge.open && challenge.start === 0));

  // ---------------------------------------------------------------- read-back only
  if (!challenge.open) {
    if (!sameRound) return;
    if (prev.status === "submitted") {
      const bond = await ctx.client.bondOf(dealId);
      const slashed = prev.bondBefore !== undefined && bond < BigInt(prev.bondBefore);
      prev.status = slashed ? "failed" : "passed";
      (slashed ? result.failed : result.passed).push(dealId);
      writeState(ctx.stateFile, ctx.state);
      return;
    }
    if (prev.status === "pending") {
      // Without a successful send the daemon must never claim a pass; an observed slash is the only
      // evidence it can still record.
      const bond = await ctx.client.bondOf(dealId);
      const slashed = prev.bondBefore !== undefined && bond < BigInt(prev.bondBefore);
      prev.status = slashed ? "failed" : "unanswered";
      if (slashed) result.failed.push(dealId);
      writeState(ctx.stateFile, ctx.state);
    }
    return;
  }

  // ---------------------------------------------------------------- still open
  if (sameRound && (prev.status === "passed" || prev.status === "failed" || prev.status === "unanswered")) {
    return;
  }
  const block = await ctx.client.blockNumber();
  if (sameRound && prev.status === "submitted") {
    // The answer landed but the round has not resolved yet. Wait for the next poll; never re-send.
    if (block >= challenge.deadline) {
      prev.status = "unanswered";
      writeState(ctx.stateFile, ctx.state);
    }
    return;
  }
  const attempts = sameRound && prev.status === "pending" ? (prev.attempts ?? 0) : 0;
  if (block >= challenge.deadline || attempts >= MAX_ANSWER_ATTEMPTS) {
    if (sameRound) {
      prev.status = "unanswered";
      writeState(ctx.stateFile, ctx.state);
    }
    return;
  }

  if (!deal.root) {
    result.unanswerable.push(`unanswerable: deal ${dealId} has no committed root`);
    return;
  }
  const entry = ctx.state.files[deal.root];
  if (!entry) {
    result.unanswerable.push(`unanswerable: deal ${dealId} root ${deal.root} is not in the store`);
    return;
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
    return;
  }
  const tree = buildTree(blocks);
  if (tree.root !== deal.root) {
    result.unanswerable.push(`unanswerable: stored blocks do not match root ${deal.root}`);
    return;
  }
  if (challenge.index >= blocks.length) {
    result.unanswerable.push(`unanswerable: challenge index ${challenge.index} outside the stored tree`);
    return;
  }
  const path = getPath(tree, challenge.index);
  if (path.length !== challenge.expectedPathLength) {
    result.unanswerable.push(
      `unanswerable: path length ${path.length} does not match expected ${challenge.expectedPathLength}`,
    );
    return;
  }

  const bondBefore = await ctx.client.bondOf(dealId);
  if (ctx.drill === "skip") {
    deal.lastChallenge = {
      index: challenge.index,
      start: challenge.start,
      status: "pending",
      attempts: MAX_ANSWER_ATTEMPTS,
      bondBefore: bondBefore.toString(),
    };
    result.skipped.push(dealId);
    writeState(ctx.stateFile, ctx.state);
    return;
  }

  let data = blocks[challenge.index];
  if (ctx.drill === "wrong") {
    data = Uint8Array.from(data);
    data[0] = data[0] ^ 0xff;
  }
  try {
    const { hash } = await ctx.client.answer(dealId, bytesToHex(data), path);
    const submittedAt = await ctx.client.blockNumber();
    const record: ChallengeRecord = {
      index: challenge.index,
      start: challenge.start,
      status: "submitted",
      attempts: attempts + 1,
      hash,
      blockNumber: submittedAt,
      bondBefore: bondBefore.toString(),
    };
    deal.lastChallenge = record;
    result.answered.push(dealId);
    writeState(ctx.stateFile, ctx.state);

    // Label only from a fresh read-back.
    const after = await ctx.client.challengeStateOf(dealId);
    if (!after.open) {
      const bond = await ctx.client.bondOf(dealId);
      record.status = bond < bondBefore ? "failed" : "passed";
      (record.status === "failed" ? result.failed : result.passed).push(dealId);
      writeState(ctx.stateFile, ctx.state);
    }
  } catch (err) {
    const failedAttempts = attempts + 1;
    const late = (await ctx.client.blockNumber()) >= challenge.deadline;
    deal.lastChallenge = {
      index: challenge.index,
      start: challenge.start,
      status: failedAttempts >= MAX_ANSWER_ATTEMPTS || late ? "unanswered" : "pending",
      attempts: failedAttempts,
      bondBefore: bondBefore.toString(),
    };
    result.unanswerable.push(`unanswerable: deal ${dealId}: ${(err as Error).message}`);
    writeState(ctx.stateFile, ctx.state);
  }
}
