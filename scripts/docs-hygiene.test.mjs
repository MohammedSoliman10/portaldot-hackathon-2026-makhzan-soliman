import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { DOC_FILES, checkDocs, extractFacts, evidenceCorpus } from "./docs-hygiene.mjs";

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

test("docs/BUSINESS.md and all project docs are in the checked list", () => {
  for (const doc of [
    "README.md",
    "docs/CHECKIN.md",
    "docs/BUSINESS.md",
    "docs/EXPLAIN.md",
    "docs/JUDGING.md",
    "docs/REPRODUCE.md",
    "docs/THREAT_MODEL.md",
  ]) {
    assert.ok(DOC_FILES.includes(doc), `DOC_FILES missing ${doc}`);
  }
});

test("the business figures in BUSINESS.md are backed by the arithmetic evidence", () => {
  const doc = { path: "docs/BUSINESS.md", text: "answer gas 3.584145274437585000 tPOT" };
  assert.deepEqual(checkDocs([doc], "22 answers 3.584145274437585000").missing, []);
  assert.equal(checkDocs([doc], "22 answers 3.584145274437585001").missing.length, 1);
});

test("the live StorageGate facts (address, tx hash, block, cost) match evidence", () => {
  const doc = {
    path: "README.md",
    text: "StorageGate 0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA tx 0x5a0f5719c447cfa771221872bcd7935f74fecedf046dc7b14acb40031b0a25a7 block 240956 cost 210.575612711692978125 tPOT",
  };
  const corpus = "0x5ee99e8ae165d0c33677c812d70b0b07820c1dca 0x5a0f5719c447cfa771221872bcd7935f74fecedf046dc7b14acb40031b0a25a7 block 240956 210.575612711692978125 tpot";
  assert.deepEqual(checkDocs([doc], corpus).missing, []);

  // One wrong digit in the cost fails
  const badCost = checkDocs([doc], corpus.replace("210.575612711692978125", "210.575612711692978124"));
  assert.equal(badCost.missing.length, 1);
  assert.equal(badCost.missing[0].kind, "amount");

  // One wrong character in the address fails
  const badAddr = checkDocs([doc], corpus.replace("0x5ee99", "0x5ee98"));
  assert.equal(badAddr.missing.length, 1);
  assert.equal(badAddr.missing[0].kind, "address");
});

test("README and docs contain the complete live gate demo section, facts, and honest notes", () => {
  const root = resolve(import.meta.dirname, "..");
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const judging = readFileSync(join(root, "docs/JUDGING.md"), "utf8");
  const business = readFileSync(join(root, "docs/BUSINESS.md"), "utf8");
  const explain = readFileSync(join(root, "docs/EXPLAIN.md"), "utf8");
  const reproduce = readFileSync(join(root, "docs/REPRODUCE.md"), "utf8");
  const threatModel = readFileSync(join(root, "docs/THREAT_MODEL.md"), "utf8");

  // README has "Live gate demo" section
  assert.ok(readme.includes("## Live gate demo"), "README must have 'Live gate demo' section");

  // Every transaction hash must be in README
  const expectedTxs = [
    "0x196d1ab6b059441ad92a17e83d98b5da2f8fa8c223ed6f79a42df238284689ee", // create 3
    "0x853225285c317dc91de4ecc9aee61be950fad7801ea64fcf25d79710d1104761", // create 4
    "0x3719248237ec37c916b11e3d014aebba05d84cedcdcdc79cc1b9feaa18a62203", // lock 4
    "0x4c63d339e7db1cfa9ef7b48194d38f6b2c2613f60d6cf0d3d3c6afbbc6d35c3f", // release 4
    "0x12557be0d42359a70cbb22acd05310efff94c1bd19223c7d524e8c59400662be", // create 5
    "0xf84af2e383b8239c350a16bdf074a14925cd954cacd3ca25ec1621a5fcf869db", // lock 5
    "0x9c8ec1c10b2f57ffa90ed22c09db49b019e26b7656825df3bd764bad46505441", // claim 3
    "0x57d35092a6f16989ae26a59fa35acec60179aac043bbf247f2ecf54c32d8e064", // settle 3
    "0x11adf58b7d5071d486e185b4485c380878768ee05c508331cd6a07c7b8347a23", // refund 5
    "0x491fdf174810101c7e96915604d78cc6c0e12bcdb1ef7d810adb264382ca1846", // claim 4
    "0x0bda52e6038d9955293ffbb2b78935638659696e4e5a1dd905809d6ee2134745", // claim 5
    "0x5a156d435057ddbeb9de0ca9b4cd48155dbf63391af0fca7cfd76231c4448279", // settle 4
    "0x54c71257ed6f82b5ba6cbd0983ea1b99b300fe705c2eed1abecab6bad719fc34", // settle 5
  ];
  for (const hash of expectedTxs) {
    assert.ok(readme.toLowerCase().includes(hash.toLowerCase()), `README must include tx hash ${hash}`);
  }

  // Fee total must be in README
  assert.ok(readme.includes("50.205185 tPOT"), "README must state the fee total 50.205185 tPOT");

  // Honest notes in docs
  const allDocs = [readme, judging, business, explain, reproduce, threatModel].join("\n");
  assert.ok(allDocs.includes("0f5e93e") && allDocs.includes("1f4b029"), "docs must mention UI fix 0f5e93e and MCP fix 1f4b029");
  assert.ok(/expiry before (?:the )?bond floor/i.test(allDocs), "docs must note guard checks expiry before bond floor");
  assert.ok(/released lock stays released/i.test(allDocs), "docs must note released lock stays released");
});

test("all live gate demo tx hashes, blocks, amounts, and fees are verified against evidence/raw/t8/", () => {
  const root = resolve(import.meta.dirname, "..");
  const corpus = evidenceCorpus(root);
  const gateDemoTxs = [
    "0x196d1ab6b059441ad92a17e83d98b5da2f8fa8c223ed6f79a42df238284689ee",
    "0x853225285c317dc91de4ecc9aee61be950fad7801ea64fcf25d79710d1104761",
    "0x3719248237ec37c916b11e3d014aebba05d84cedcdcdc79cc1b9feaa18a62203",
    "0x4c63d339e7db1cfa9ef7b48194d38f6b2c2613f60d6cf0d3d3c6afbbc6d35c3f",
    "0x12557be0d42359a70cbb22acd05310efff94c1bd19223c7d524e8c59400662be",
    "0xf84af2e383b8239c350a16bdf074a14925cd954cacd3ca25ec1621a5fcf869db",
    "0x9c8ec1c10b2f57ffa90ed22c09db49b019e26b7656825df3bd764bad46505441",
    "0x57d35092a6f16989ae26a59fa35acec60179aac043bbf247f2ecf54c32d8e064",
    "0x11adf58b7d5071d486e185b4485c380878768ee05c508331cd6a07c7b8347a23",
    "0x491fdf174810101c7e96915604d78cc6c0e12bcdb1ef7d810adb264382ca1846",
    "0x0bda52e6038d9955293ffbb2b78935638659696e4e5a1dd905809d6ee2134745",
    "0x5a156d435057ddbeb9de0ca9b4cd48155dbf63391af0fca7cfd76231c4448279",
    "0x54c71257ed6f82b5ba6cbd0983ea1b99b300fe705c2eed1abecab6bad719fc34",
  ];
  for (const hash of gateDemoTxs) {
    assert.ok(corpus.includes(hash.toLowerCase()), `tx ${hash} must exist in evidence`);
  }
  const gateDemoBlocks = [
    "250092", "252512", "252523", "252535", "252544", "252552",
    "258836", "258844", "264442", "264450", "264458", "264469", "264477",
  ];
  for (const blk of gateDemoBlocks) {
    assert.ok(new RegExp(`(^|[^0-9])${blk}([^0-9]|$)`).test(corpus), `block ${blk} must exist in evidence`);
  }
  assert.ok(corpus.includes("50.205184994871606830") || corpus.includes("50.205185"), "fee total must exist in evidence");
});
