/**
 * Daemon entry point: settings from the environment, viem wiring, upload endpoint, polling loop.
 *
 * The loop logs the five state labels every cycle (`submitted`, `passed`, `failed`, `skipped`,
 * `unanswered`), survives a failed cycle, and stops gracefully on SIGINT/SIGTERM after the cycle in
 * flight. The key never appears in a log line or in the state file.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import { makeChain } from "./chain.ts";
import {
  MAX_ANSWER_ATTEMPTS,
  pollOnce,
  startUploadServer,
  type ChainClient,
  type PollResult,
} from "./daemon.ts";
import { loadSettings } from "./settings.ts";
import { emptyState, readState, writeState, type StateFile } from "./state.ts";
import { UploadReceiver } from "./upload.ts";

export interface DaemonLoop {
  poll(): Promise<PollResult>;
  wait(ms: number): Promise<void>;
  log(line: string): void;
}

export interface LoopOptions {
  intervalMs: number;
  iterations?: number;
  signal?: AbortSignal;
}

/** One cycle is never interrupted: an abort takes effect after the cycle and its wait. */
export async function runLoop(loop: DaemonLoop, options: LoopOptions): Promise<void> {
  let cycles = 0;
  while (!options.signal?.aborted) {
    if (options.iterations !== undefined && cycles >= options.iterations) return;
    cycles += 1;
    try {
      const result = await loop.poll();
      loop.log(
        `cycle: submitted=[${result.answered.join(",")}] passed=[${result.passed.join(",")}] ` +
          `failed=[${result.failed.join(",")}] skipped=[${result.skipped.join(",")}] ` +
          `unanswered=[${result.unanswerable.join(",")}] unknownDeal=[${result.unknownDeal.join(",")}]`,
      );
    } catch (err) {
      loop.log(`cycle failed: ${(err as Error).message}`);
    }
    await loop.wait(options.intervalMs);
  }
}

function drill(env: NodeJS.ProcessEnv): "wrong" | "skip" | undefined {
  const value = env.MAKHZAN_DRILL;
  if (value === undefined || value === "") return undefined;
  if (value !== "wrong" && value !== "skip") {
    throw new Error(`MAKHZAN_DRILL must be "wrong" or "skip" (got ${JSON.stringify(value)})`);
  }
  return value;
}

function seedState(state: StateFile, settings: { chainId: number }, providerId: number): StateFile {
  if (state.chainId === 0) {
    return { ...emptyState(settings.chainId, providerId), files: state.files, deals: state.deals };
  }
  return state;
}

export async function main(env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  let server: Server | undefined;
  const controller = new AbortController();
  const stop = (signal: string) => () => {
    log(`daemon stopping on ${signal}: finishing the cycle in flight`);
    controller.abort();
  };
  process.once("SIGINT", stop("SIGINT"));
  process.once("SIGTERM", stop("SIGTERM"));

  try {
    const settings = loadSettings(env);
    const wiring = makeChain(settings, env);
    const providerId = env.MAKHZAN_PROVIDER_ID
      ? Number(env.MAKHZAN_PROVIDER_ID)
      : (await wiring.providerOf(wiring.account)).id;
    if (!Number.isInteger(providerId) || providerId <= 0) {
      throw new Error("this account is not a registered provider; register it before starting the daemon");
    }
    const round = drill(env);
    const stateDir = settings.stateDir;
    const stateFile = join(stateDir, "state.json");
    const { state: loaded } = readState(stateFile);
    const state = seedState(loaded, settings, providerId);
    writeState(stateFile, state);

    const receiver = new UploadReceiver({
      blockSize: Number(env.MAKHZAN_BLOCK_SIZE ?? 1024),
      storeDir: join(stateDir, "files"),
    });
    const accept = receiver.accept.bind(receiver);
    receiver.accept = (envelope: unknown) => {
      const ack = accept(envelope);
      if (ack) {
        state.files[ack.root] = {
          size: ack.size,
          leafCount: ack.leafCount,
          path: join("files", ack.root),
        };
        writeState(stateFile, state);
        log(`upload accepted: root ${ack.root} size ${ack.size} leafCount ${ack.leafCount}`);
      }
      return ack;
    };
    server = await startUploadServer(receiver, settings.daemonPort);
    log(
      `daemon listening on ${settings.daemonUrl}/upload (network ${settings.network}, ` +
        `provider ${providerId}, poll ${settings.pollMs} ms, max attempts ${MAX_ANSWER_ATTEMPTS})`,
    );

    const loop: DaemonLoop = {
      async poll() {
        const discovered = await wiring.discoverDeals(providerId);
        let changed = false;
        for (const deal of discovered) {
          if (state.deals[String(deal.dealId)]) continue;
          state.deals[String(deal.dealId)] = {
            role: "provider",
            owner: deal.owner,
            providerId,
            root: deal.root,
          };
          changed = true;
        }
        if (changed) writeState(stateFile, state);
        return pollOnce({ client: wiring.chain as ChainClient, state, stateFile, drill: round });
      },
      wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      },
      log,
    };
    await runLoop(loop, { intervalMs: settings.pollMs, signal: controller.signal });
    log("daemon stopped");
    return 0;
  } catch (err) {
    log(`daemon failed: ${(err as Error).message}`);
    return 1;
  } finally {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env, (line) => console.log(line)).then((code) => process.exit(code));
}
