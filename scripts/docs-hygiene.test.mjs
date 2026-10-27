import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DOC_FILES, checkDocs, extractFacts } from "./docs-hygiene.mjs";

test("an address, a hash and a block number are extracted from one line", () => {
  const facts = extractFacts(
    "contract 0x60481DFcFCA34A8F095939D9675eC715127B2e44 tx 0x" +
      "ab".repeat(32) +
      " block 171308",
  );
  assert.deepEqual(
    facts.map((fact) => fact.kind),
    ["address", "tx-or-block-hash", "block"],
  );
});

test("a bond in tPOT is accepted as tPOT, native units or wei in the evidence", () => {
  const doc = { path: "README.md", text: "provider bond 30 tPOT" };
  const units = checkDocs([doc], "bond 3000000000000000 units");
  assert.deepEqual(units.missing, []);
  const wei = checkDocs([doc], "bond 30000000000000000000 wei");
  assert.deepEqual(wei.missing, []);
  const literal = checkDocs([doc], "bond stayed at 30 tPOT");
  assert.deepEqual(literal.missing, []);
});

test("a changed bond figure is reported with its doc line", () => {
  const doc = { path: "docs/CHECKIN.md", text: "| Bond | 25 tPOT |" };
  const { missing } = checkDocs([doc], "bond 2400000000000000 units");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].kind, "amount");
  assert.equal(missing[0].value, "25");
  assert.equal(missing[0].line, 1);
});

test("a tx hash that differs by one character is reported", () => {
  const hash = "0x" + "ab".repeat(31) + "cd";
  const doc = { path: "README.md", text: `tx ${hash}` };
  const { missing } = checkDocs([doc], `tx 0x${"ab".repeat(32)}`);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].kind, "tx-or-block-hash");
});

test("a block number is matched only as its own token", () => {
  const doc = { path: "README.md", text: "block 171308" };
  assert.deepEqual(checkDocs([doc], "finalized at block 171308").missing, []);
  assert.equal(checkDocs([doc], "block 1713080").missing.length, 1);
});

test("docs/BUSINESS.md is in the checked list, so its figures cannot drift silently", () => {
  assert.ok(DOC_FILES.includes("docs/BUSINESS.md"));
});

test("the business figures in BUSINESS.md are backed by the arithmetic evidence", () => {
  const doc = { path: "docs/BUSINESS.md", text: "answer gas 3.584145274437585000 tPOT" };
  assert.deepEqual(checkDocs([doc], "22 answers 3.584145274437585000").missing, []);
  assert.equal(checkDocs([doc], "22 answers 3.584145274437585001").missing.length, 1);
});
