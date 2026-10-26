#!/usr/bin/env node
/**
 * Docs hygiene: every address, tx hash, block number and bond figure in README.md and
 * docs/CHECKIN.md must also appear in the committed evidence. The check is literal where it can be
 * and converted where the units differ (tPOT -> native units -> wei), so a number cannot drift away
 * from the record that proves it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DOC_FILES = ["README.md", "docs/CHECKIN.md"];
export const EVIDENCE_DIR = "evidence";

const EVIDENCE_EXTENSIONS = new Set([".json", ".txt", ".md", ".log"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EVIDENCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) out.push(path);
  }
  return out;
}

/** One lowercased blob: hashes and addresses are compared without case. */
export function evidenceCorpus(root) {
  return walk(join(root, EVIDENCE_DIR))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n")
    .toLowerCase();
}

function decimal(value, places) {
  const [whole, fraction = ""] = value.replace(/,/g, "").split(".");
  const padded = fraction.padEnd(places, "0").slice(0, places);
  return BigInt(whole + padded).toString();
}

/** All the spellings of one tPOT figure that the evidence might use. */
function tPotVariants(value) {
  const [whole, fraction = ""] = value.replace(/,/g, "").split(".");
  const variants = [value, `${whole}${fraction ? `.${fraction}` : ""} tpot`];
  const wei = decimal(value, 18);
  variants.push(wei, `${wei} wei`);
  if (fraction.length <= 14) variants.push(decimal(value, 14), `${decimal(value, 14)} units`);
  return variants;
}

export function extractFacts(text) {
  const facts = [];
  const seen = new Set();
  const add = (kind, value, variants) => {
    const key = `${kind}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ kind, value, variants: variants.map((v) => v.toLowerCase()) });
  };

  for (const match of text.matchAll(/0x[0-9a-fA-F]{40}\b/g)) add("address", match[0], [match[0]]);
  for (const match of text.matchAll(/0x[0-9a-fA-F]{64}\b/g)) add("tx-or-block-hash", match[0], [match[0]]);
  for (const match of text.matchAll(/\b5[1-9A-HJ-NP-Za-km-z]{47}\b/g)) add("ss58", match[0], [match[0]]);

  for (const match of text.matchAll(/\bblock(?:s)?\s+`?(\d{2,9})`?/g)) add("block", match[1], [match[1]]);
  for (const match of text.matchAll(/\|\s*Block\s*\|\s*`?(\d{2,9})`?/g)) add("block", match[1], [match[1]]);

  for (const match of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*tPOT/g)) add("amount", match[1], tPotVariants(match[1]));
  for (const match of text.matchAll(/\b(\d{6,})\s*units\b/g)) {
    add("amount", match[1], [`${match[1]} units`, match[1], (BigInt(match[1]) * 10_000n).toString()]);
  }
  return facts;
}

/** Returns the facts that no evidence file backs, with the doc line that states them. */
export function checkDocs(docs, corpus) {
  const lower = corpus.toLowerCase();
  const missing = [];
  let checked = 0;
  for (const doc of docs) {
    doc.text.split("\n").forEach((line, index) => {
      for (const fact of extractFacts(line)) {
        checked++;
        const found =
          fact.kind === "block"
            ? new RegExp(`(^|[^0-9])${fact.value}([^0-9]|$)`).test(lower)
            : fact.variants.some((variant) => lower.includes(variant));
        if (!found) {
          missing.push({ file: doc.path, line: index + 1, kind: fact.kind, value: fact.value, text: line.trim() });
        }
      }
    });
  }
  return { checked, missing };
}

export function main(root = process.cwd()) {
  const docs = DOC_FILES.map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));
  const { checked, missing } = checkDocs(docs, evidenceCorpus(root));
  if (missing.length > 0) {
    console.error(`docs hygiene: ${missing.length} fact(s) not backed by ${EVIDENCE_DIR}/`);
    for (const fact of missing) {
      console.error(`  ${fact.file}:${fact.line} ${fact.kind} ${fact.value} — ${fact.text}`);
    }
    return 1;
  }
  console.log(`docs hygiene: ${checked} facts in ${DOC_FILES.join(", ")} all match ${EVIDENCE_DIR}/`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
