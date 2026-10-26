#!/usr/bin/env node
/**
 * Whole-history secret scan.
 *
 * The tree scan (`scripts/secret-scan.mjs`) only sees the working tree. This walks every blob
 * reachable from every ref, applies the same rules through `scanText`, and dedupes by blob id so a
 * value that was committed once and then rewritten is still found.
 *
 * Privacy: findings print the path, line number and rule only. The matched value is never printed.
 *
 * Known and closed: a scratch canary was captured verbatim in `evidence/raw/t1/55-secret-scan.txt`
 * at commit 2af8a44 and redacted afterwards. The redaction is a later blob, so the old blob is still
 * in history and still matches rules A-D. That one blob is allowlisted by its exact object id
 * (`KNOWN_BLOB`); every other finding fails the scan. SEC-001 closed this without a history rewrite.
 */
import { execFileSync } from "node:child_process";
import { extname, resolve } from "node:path";
import { TEXT, scanText } from "./secret-scan.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const git = (args, input) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 256 * 1024 * 1024,
  });

const KNOWN_BLOB_SHA = "2af8a44";
const KNOWN_BLOB_PATH = "evidence/raw/t1/55-secret-scan.txt";

const SENSITIVE = [
  /(^|\/)\.env(\.(?!example$)[^/]*)?$/,
  /(^|\/)id\.json$/,
  /\.keypair$/,
  /(^|\/)keystore[^/]*$/,
  /(^|\/)wallet[^/]*\.json$/,
  /\.key$/,
  /\.pem$/,
];

const knownSha = git(["rev-parse", `${KNOWN_BLOB_SHA}:${KNOWN_BLOB_PATH}`]).trim();
const head = git(["rev-parse", "--short", "HEAD"]).trim();
const refs = git(["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes", "refs/tags"])
  .trim()
  .split("\n")
  .filter(Boolean);

// `<sha> <path>` pairs for every object reachable from a ref.
const pairs = git(["rev-list", "--objects", "--all"])
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const space = line.indexOf(" ");
    return space === -1 ? { sha: line, path: "" } : { sha: line.slice(0, space), path: line.slice(space + 1) };
  });

const blobs = new Map(); // sha -> first path seen
const sensitivePaths = new Set();
for (const { sha, path } of pairs) {
  if (path && SENSITIVE.some((re) => re.test(path))) sensitivePaths.add(path);
  if (path && !blobs.has(sha)) blobs.set(sha, path);
}

// Keep only blobs: `cat-file --batch-check` is one process for the whole set.
const checkInput = [...blobs.keys()].join("\n") + "\n";
const types = new Map();
for (const line of git(["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], checkInput)
  .trim()
  .split("\n")) {
  const [sha, type, size] = line.split(" ");
  types.set(sha, { type, size: Number(size) });
}

const findings = [];
let scanned = 0;
let skippedBinary = 0;
for (const [sha, path] of blobs) {
  const meta = types.get(sha);
  if (!meta || meta.type !== "blob") continue;
  if (!TEXT.has(extname(path))) {
    skippedBinary++;
    continue;
  }
  const text = git(["cat-file", "blob", sha]);
  scanned++;
  for (const finding of scanText(path, text)) {
    findings.push({ sha, path, rule: finding.rule, line: finding.line, known: sha === knownSha });
  }
}

const novel = findings.filter((finding) => !finding.known);
const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

console.log("# secret scan — whole git history");
console.log(`# utc: ${now}`);
console.log(`# HEAD: ${head}`);
console.log("# rules: scripts/secret-scan.mjs (imported, so the two scans cannot drift)");
console.log("# no secret values are printed, only paths, lines and rule names");
console.log(`refs scanned: ${refs.length}`);
console.log(`objects reachable from refs: ${pairs.length}`);
console.log(`unique blobs: ${blobs.size}`);
console.log(`text blobs scanned: ${scanned}`);
console.log(`non-text blobs skipped: ${skippedBinary}`);
console.log(`sensitive paths ever committed: ${sensitivePaths.size}`);
for (const path of [...sensitivePaths].sort()) console.log(`  ${path}`);
console.log(`findings: ${findings.length}`);
for (const finding of findings) {
  const tag = finding.known ? "known/closed SEC-001" : "NEW";
  console.log(`  ${finding.path}:${finding.line} ${finding.rule} blob ${finding.sha.slice(0, 8)} [${tag}]`);
}
if (findings.length === 0) {
  console.log("RESULT: PASS — no secret-shaped value in any reachable blob");
} else if (novel.length === 0) {
  console.log(
    `RESULT: PASS — no new findings; the only ${findings.length} matches are in the closed SEC-001 canary blob`,
  );
} else {
  console.log(`RESULT: FAIL — ${novel.length} new finding(s) outside the closed canary`);
}
process.exit(novel.length === 0 ? 0 : 1);
