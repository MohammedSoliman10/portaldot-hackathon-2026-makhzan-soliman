/** CLI entry point. */
import type { CommandDeps } from "./cli.ts";

export async function runCommand(_argv: string[], _deps: CommandDeps, _log: (line: string) => void): Promise<number> {
  throw new Error("not implemented");
}

export async function main(_argv: string[], _env: NodeJS.ProcessEnv, _log: (line: string) => void): Promise<number> {
  throw new Error("not implemented");
}
