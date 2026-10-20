import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile, RPC_LOG_DIR } from "../config.ts";

export interface EvmSample {
  ok: boolean;
  latencyMs?: number;
  blockNumber?: number;
  chainId?: string;
  error?: string;
}

export interface WsSample {
  ok: boolean;
  latencyMs?: number;
  blockNumber?: number | null;
  source?: "chain_subscribeNewHeads" | "system_health";
  error?: string;
}

export interface DaemonTick {
  ts: string;
  evm: EvmSample;
  ws: WsSample;
}

export function utcStamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function dayFileFor(date: Date): string {
  return join(RPC_LOG_DIR, `${date.toISOString().slice(0, 10)}.jsonl`);
}

function assertExactlyOne(label: string, sample: EvmSample | WsSample): void {
  if (sample.ok && sample.error) throw new Error(`${label}: exactly one of ok or error is allowed`);
  if (!sample.ok && !sample.error) throw new Error(`${label}: a failed sample requires an error`);
}

export function buildTick(now: Date, evm: EvmSample, ws: WsSample): DaemonTick {
  assertExactlyOne("evm", evm);
  assertExactlyOne("ws", ws);
  return { ts: utcStamp(now), evm, ws };
}

async function rpc(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? JSON.stringify(body.error));
  return body.result;
}

export async function probeEvm(url: string): Promise<EvmSample> {
  const started = performance.now();
  try {
    const chainId = (await rpc(url, "eth_chainId")) as string;
    const blockHex = (await rpc(url, "eth_blockNumber")) as string;
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      blockNumber: Number(BigInt(blockHex)),
      chainId: String(Number(BigInt(chainId))),
    };
  } catch (error) {
    return { ok: false, error: `${(error as Error).name}: ${(error as Error).message}` };
  }
}

interface WsReply {
  id?: number;
  result?: unknown;
  error?: { message?: string };
  method?: string;
  params?: { result?: { number?: string } };
}

function wsCall(
  url: string,
  method: string,
  params: unknown[],
  onSubscriptionHead: boolean,
): Promise<{ value: unknown; head: number | null }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const id = 1;
    let subscription: string | null = null;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`timeout after 5000ms`));
    }, 5_000);

    socket.onopen = () => socket.send(JSON.stringify({ id, jsonrpc: "2.0", method, params }));
    socket.onerror = () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error("websocket error"));
    };
    socket.onmessage = (event) => {
      let message: WsReply;
      try {
        message = JSON.parse(String(event.data)) as WsReply;
      } catch {
        return;
      }
      if (message.id === id) {
        if (message.error) {
          clearTimeout(timer);
          socket.close();
          reject(new Error(message.error.message ?? JSON.stringify(message.error)));
          return;
        }
        if (!onSubscriptionHead) {
          clearTimeout(timer);
          socket.close();
          resolve({ value: message.result, head: null });
          return;
        }
        subscription = String(message.result);
        return;
      }
      if (onSubscriptionHead && subscription && message.method === "chain_newHead") {
        const number = message.params?.result?.number;
        clearTimeout(timer);
        socket.close();
        resolve({ value: true, head: number ? Number(BigInt(number)) : null });
      }
    };
  });
}

export async function probeWs(url: string): Promise<WsSample> {
  const started = performance.now();
  try {
    const { head } = await wsCall(url, "chain_subscribeNewHeads", [], true);
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      blockNumber: head,
      source: "chain_subscribeNewHeads",
    };
  } catch (subscriptionError) {
    const startedFallback = performance.now();
    try {
      await wsCall(url, "system_health", [], false);
      return {
        ok: true,
        latencyMs: Math.round(performance.now() - startedFallback),
        blockNumber: null,
        source: "system_health",
      };
    } catch (fallbackError) {
      return {
        ok: false,
        error: `subscribe: ${(subscriptionError as Error).message}; system_health: ${(fallbackError as Error).message}`,
      };
    }
  }
}

async function appendTick(tick: DaemonTick): Promise<void> {
  await mkdir(RPC_LOG_DIR, { recursive: true });
  await appendFile(dayFileFor(new Date(tick.ts)), `${JSON.stringify(tick)}\n`);
}

async function tick(evmUrl: string, wsUrl: string): Promise<void> {
  const [evm, ws] = await Promise.all([probeEvm(evmUrl), probeWs(wsUrl)]);
  const sample = buildTick(new Date(), evm, ws);
  await appendTick(sample);
  console.log(`${sample.ts} evm=${sample.evm.ok ? "ok" : "error"} ws=${sample.ws.ok ? "ok" : "error"}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const evmUrl = process.env.PORTALDOT_EVM_RPC_URL;
  const wsUrl = process.env.PORTALDOT_WS_URL;
  if (!evmUrl || !wsUrl) {
    console.error("PORTALDOT_EVM_RPC_URL and PORTALDOT_WS_URL are required");
    process.exit(4);
  }
  const intervalMs = 180_000;
  const stop = () => process.exit(0);
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await tick(evmUrl, wsUrl);
  setInterval(() => {
    void tick(evmUrl, wsUrl).catch((error) => {
      console.error(`${utcStamp(new Date())} tick failed: ${(error as Error).message}`);
    });
  }, intervalMs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
