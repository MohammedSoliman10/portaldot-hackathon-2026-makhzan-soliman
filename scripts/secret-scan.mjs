#!/usr/bin/env node
/**
 * Secret scan for the tier-1 artifacts.
 *
 * Rules:
 *  A. a PEM private-key block (every file);
 *  B. a literal key on a key flag or env assignment (not a placeholder, not a `$VAR` reference);
 *  C. a 64-hex key shape on a line that also names a key/secret;
 *  D. a quoted 12/15/18/21/24-word mnemonic phrase;
 *  E. a real `.env` file (`.env.example` is allowed);
 *  F. a key-like JSON field with a non-empty value.
 *
 * The one allowlisted value is anvil's PUBLIC default mnemonic, which is not a secret. Test files are
 * exempt from B, C and F: they carry deliberate fixtures that prove the guards reject them, and those
 * fixtures are listed in `evidence/raw/t1/53-evidence-red.txt` and `54-evidence-green.txt`. Anything
 * else is a finding and makes the scan exit 1.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["."];

const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
const SKIP_DIRS = new Set([".git", "node_modules", "lib", "out", "cache", "broadcast", ".next"]);
export const TEXT = new Set([".sol", ".ts", ".mjs", ".js", ".json", ".md", ".yml", ".yaml", ".toml", ".txt", ".env", ""]);
const LITERAL = /(0x[0-9a-fA-F]{32,}|[A-Za-z0-9+/=]{32,})/;
const QUOTED_MNEMONIC = /["'`]((?:[a-z]{3,8}[ \t]+){11,23}[a-z]{3,8})["'`]/;
const WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

/**
 * Narrow, documented allowlist. Each entry names one rule, one exact repository-relative file and one
 * exact matched literal, so it cannot hide a different value in the same file or the same value
 * anywhere else. Kept intentionally short: a path fragment is not a secret.
 */
const ALLOWLIST = [
  {
    rule: "C",
    path: "specs/001-tier0-gates/tasks.md",
    literal: "contracts/test/tier0/RoundCostProbe",
    reason:
      "A Solidity test path is 32+ characters and contains '/', so the base64-shaped rule C matches " +
      "it on a line that also says 'seed'. It is not a key; the tier0 spec is unchanged by this feature.",
  },
];

function allowlisted(rel, line, rule) {
  return ALLOWLIST.some((entry) => {
    if (entry.rule !== rule || entry.path !== rel) return false;
    const match = LITERAL.exec(line);
    return match !== null && match[0] === entry.literal;
  });
}

function wordsOf(phrase) {
  return phrase.trim().split(/\s+/).length;
}

function walk(path, out) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (SKIP_DIRS.has(name)) continue;
      walk(join(path, name), out);
    }
    return;
  }
  out.push(path);
}

/**
 * Apply rules A–F to one text blob. `scripts/secret-scan-history.mjs` imports this, so the tree scan
 * and the history scan cannot drift apart. The returned `text` is the offending line; a caller that
 * must not print values (the history scan) reports `rule` and `line` only.
 */
export function scanText(rel, text) {
  const isTest = rel.endsWith(".test.ts");
  const isScanner = rel.endsWith("scripts/secret-scan.mjs");
  const out = [];
  text.split("\n").forEach((line, i) => {
    const at = i + 1;
    const excerpt = line.trim().slice(0, 120);
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) {
      out.push({ rule: "A/pem", line: at, text: excerpt });
    }
    if (!isScanner && !isTest && !line.includes(ANVIL_MNEMONIC)) {
      const flag = /--(?:private-key|privatekey|mnemonic|seed)\s+("?)(0x[0-9a-fA-F]{32,}|[A-Za-z0-9+/=]{32,})\1/.exec(line);
      const env = /\b(PRIVATE_KEY|MNEMONIC|SEED|SECRET|API_KEY|OWNER_KEY|PROVIDER_KEY)\s*=\s*("?)(0x[0-9a-fA-F]{32,}|[A-Za-z0-9+/=]{32,})\2/.exec(line);
      if (flag || env) out.push({ rule: "B/key-literal", line: at, text: excerpt });
      if (/\b(key|secret|private|mnemonic|seed)\b/i.test(line) && LITERAL.test(line) && !allowlisted(rel, line, "C")) {
        out.push({ rule: "C/hex-key-shape", line: at, text: excerpt });
      }
    }
    const quoted = QUOTED_MNEMONIC.exec(line);
    if (quoted && WORD_COUNTS.has(wordsOf(quoted[1])) && !line.includes(ANVIL_MNEMONIC)) {
      out.push({ rule: "D/mnemonic", line: at, text: excerpt });
    }
    if (!isTest && !isScanner) {
      const field = /"(private_?key|mnemonic|seed|secret|api_?key)"\s*:\s*"[^"]+"/i.exec(line);
      if (field) out.push({ rule: "F/key-like-field", line: at, text: excerpt });
    }
  });
  return out;
}

export function main() {
  const files = [];
  for (const target of targets) {
    const path = resolve(root, target);
    if (!existsSync(path)) {
      console.error(`skip (missing): ${target}`);
      continue;
    }
    walk(path, files);
  }

  const findings = [];
  let scanned = 0;
  for (const file of files) {
    const rel = relative(root, file);
    if (rel.endsWith(".env") && !rel.endsWith(".env.example")) {
      findings.push(`${rel}: E/real-env-file`);
      continue;
    }
    if (!TEXT.has(extname(file))) continue;
    const text = readFileSync(file, "utf8");
    scanned++;
    for (const finding of scanText(rel, text)) {
      findings.push(`${rel}:${finding.line}: ${finding.rule}: ${finding.text}`);
    }
  }

  if (findings.length > 0) {
    console.error(`secret scan FAILED — ${findings.length} finding(s) in ${scanned} files`);
    for (const finding of findings) console.error(`  ${finding}`);
    return 1;
  }
  console.log(`secret scan PASS — 0 findings in ${scanned} files (${files.length} paths)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
