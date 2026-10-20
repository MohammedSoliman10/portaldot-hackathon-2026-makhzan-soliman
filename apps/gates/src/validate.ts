import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { EVIDENCE_DIR, GATES_DIR, loadedSecrets, REPO_ROOT } from "./config.ts";
import { EvidenceError, validateRecord, type GateRecord } from "./lib/evidence.ts";

const FIXTURES = join(REPO_ROOT, "apps", "gates", "test", "fixtures", "gates");

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => join(dir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function walk(dir: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path)));
    else if (entry.isFile() && !entry.name.endsWith(".jsonl") && !entry.name.endsWith(".json")) found.push(path);
  }
  return found;
}

async function main(): Promise<void> {
  const secrets = loadedSecrets();
  const withFixtures = process.argv.includes("--fixtures");
  const files = [...(await jsonFiles(GATES_DIR)), ...(withFixtures ? await jsonFiles(FIXTURES) : [])];
  let failures = 0;
  let checked = 0;

  for (const file of files) {
    checked += 1;
    const display = file.slice(REPO_ROOT.length + 1);
    try {
      const record = JSON.parse(await readFile(file, "utf8")) as GateRecord;
      validateRecord(record, { repoRoot: REPO_ROOT, secrets });
      console.log(`ok   ${display}`);
    } catch (error) {
      failures += 1;
      const message = error instanceof EvidenceError ? error.issues.join("; ") : (error as Error).message;
      console.log(`FAIL ${display}: ${message}`);
    }
  }

  const rawFiles = await walk(EVIDENCE_DIR);
  for (const file of rawFiles) {
    const text = await readFile(file, "utf8");
    for (const secret of secrets) {
      if (secret.length >= 32 && text.includes(secret)) {
        failures += 1;
        console.log(`FAIL secret value found in ${file.slice(REPO_ROOT.length + 1)}`);
      }
    }
  }

  const evidenceStat = await stat(EVIDENCE_DIR).catch(() => null);
  console.log(`checked ${checked} record(s) and ${rawFiles.length} raw file(s); evidence dir ${evidenceStat ? "present" : "missing"}`);
  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(3);
  }
}

await main();
