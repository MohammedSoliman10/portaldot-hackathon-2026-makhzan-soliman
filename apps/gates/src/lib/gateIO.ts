import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gateRawDir, gateRecordPath, loadedSecrets, REPO_ROOT } from "../config.ts";
import { sanitize, writeRecord, type GateRecord } from "./evidence.ts";

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
