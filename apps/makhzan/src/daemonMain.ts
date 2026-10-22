/** Daemon loop entry point. */
import type { PollResult } from "./daemon.ts";

export interface DaemonLoop {
  poll(): Promise<PollResult>;
  wait(ms: number): Promise<void>;
  log(line: string): void;
}

export async function runLoop(_loop: DaemonLoop, _options: { intervalMs: number; iterations?: number; signal?: AbortSignal }): Promise<void> {
  throw new Error("not implemented");
}

export async function main(_env: NodeJS.ProcessEnv, _log: (line: string) => void): Promise<number> {
  throw new Error("not implemented");
}
