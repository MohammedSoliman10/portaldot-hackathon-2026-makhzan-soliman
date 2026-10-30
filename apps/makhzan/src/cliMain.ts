/**
 * CLI entry point: settings from the environment, viem wiring, then the documented commands.
 *
 * The key is read from MAKHZAN_PRIVATE_KEY at start-up and only lives in the viem account. It is not
 * printed, not put on argv and not part of any record.
 */
import { pathToFileURL } from "node:url";
import { makeChain } from "./chain.ts";
import { execute, parseCommand, type CommandDeps } from "./cli.ts";
import { runVerify } from "./dealVerifyCli.ts";
import { mapContractError } from "./errors.ts";
import { executeGate, makeGateDeps, parseGateCommand, type GateCommandDeps } from "./gateCli.ts";
import { loadReadOnlySettings, loadSettings } from "./settings.ts";

/** JSON with bigint values rendered as decimal strings, so a record is stable evidence. */
export function serialise(record: unknown): string {
  return JSON.stringify(record, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
}

/** Parses, executes and prints one command. Returns the process exit code. */
export async function runCommand(argv: string[], deps: CommandDeps, log: (line: string) => void): Promise<number> {
  try {
    const command = parseCommand(argv);
    const record = await execute(command, deps);
    log(serialise(record));
    return 0;
  } catch (err) {
    log(`cli failed: ${mapContractError((err as Error).message)}`);
    return 1;
  }
}

/** Parses, executes and prints one gate command. Returns the process exit code. */
export async function runGate(
  argv: string[],
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
  depsOverride?: GateCommandDeps,
): Promise<number> {
  try {
    const command = parseGateCommand(argv);
    let deps = depsOverride;
    if (!deps) {
      if (command.name === "gate:status") {
        const settings = loadReadOnlySettings(env);
        deps = makeGateDeps(settings, command.gate, env);
      } else {
        const settings = loadSettings(env);
        deps = makeGateDeps(settings, command.gate, env);
      }
    }
    const record = await executeGate(command, deps, env);
    log(serialise(record));
    return 0;
  } catch (err) {
    log(`gate failed: ${mapContractError((err as Error).message)}`);
    return 1;
  }
}

export async function main(argv: string[], env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  try {
    // `verify` is read-only: it must run without MAKHZAN_PRIVATE_KEY, so it is dispatched first.
    if (argv[0] === "verify") return await runVerify(argv.slice(1), env, log);
    if (argv[0] === "gate") return await runGate(argv.slice(1), env, log);
    const settings = loadSettings(env);
    const wiring = makeChain(settings, env);
    return await runCommand(
      argv,
      { contract: settings.contract, chain: wiring.chain, uploader: wiring.uploader, reporter: wiring.reporter },
      log,
    );
  } catch (err) {
    log(`cli failed: ${(err as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env, (line) => console.log(line)).then((code) => process.exit(code));
}
