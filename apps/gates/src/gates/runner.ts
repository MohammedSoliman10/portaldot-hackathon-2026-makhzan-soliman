import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertNoKeyOnArgv, gateRawDir, gateRecordPath, loadedSecrets, REPO_ROOT } from "../config.ts";
import { EvidenceError, sanitize, writeRecord, type GateRecord } from "../lib/evidence.ts";
import { isGateId } from "./registry.ts";

export class RawLog {
  private counter = 0;
  private readonly dir: string;
  private readonly secrets: string[];

  private constructor(dir: string) {
    this.dir = dir;
    this.secrets = loadedSecrets();
  }

  static async create(gateId: string): Promise<RawLog> {
    const log = new RawLog(gateRawDir(gateId));
    await mkdir(log.dir, { recursive: true });
    return log;
  }

  async write(label: string, text: string): Promise<string> {
    this.counter += 1;
    const name = `${String(this.counter).padStart(2, "0")}-${label}.txt`;
    const path = join(this.dir, name);
    const safe = sanitize(text, this.secrets);
    await writeFile(path, safe.endsWith("\n") ? safe : `${safe}\n`);
    return path;
  }

  relative(path: string): string {
    return path.slice(REPO_ROOT.length + 1).split("\\").join("/");
  }
}

export async function writeGateRecord(record: GateRecord): Promise<string> {
  const path = gateRecordPath(record.gateId);
  await writeRecord(record, path, { repoRoot: REPO_ROOT, secrets: loadedSecrets() });
  return path;
}

export function exitCodeFor(record: GateRecord): number {
  return record.runState === "done" ? 0 : 2;
}

async function main(): Promise<void> {
  assertNoKeyOnArgv();
  const requested = process.argv[2];
  if (!requested || !isGateId(requested)) {
    console.error("usage: npm run gate -- <G01..G10>");
    process.exit(4);
  }
  const gateId = requested.toUpperCase();
  if (gateId === "G10") {
    console.error("G10 is collected by the probe daemon; finalize it with the rollup task.");
    process.exit(4);
  }

  const modulePath = `./${gateId.toLowerCase()}.ts`;
  let gateModule: { run: () => Promise<number> };
  try {
    gateModule = (await import(modulePath)) as { run: () => Promise<number> };
  } catch (error) {
    console.error(`gate ${gateId} is not implemented yet: ${(error as Error).message}`);
    process.exit(4);
  }

  try {
    const code = await gateModule.run();
    process.exit(code);
  } catch (error) {
    if (error instanceof EvidenceError) {
      console.error(`validation failed: ${error.message}`);
      process.exit(3);
    }
    console.error(`gate ${gateId} crashed: ${(error as Error).stack ?? String(error)}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
