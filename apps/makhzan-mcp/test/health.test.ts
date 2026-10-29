import { strict as assert } from "node:assert";
import { test } from "node:test";
import { guardDecision, healthTool } from "../src/tools/health.ts";
import { CONTRACT, fakeReads } from "./helpers.ts";

test("guardDecision maps healthOf and the term exactly as MakhzanGuard does", () => {
  assert.equal(guardDecision(1, 1000, 999), "healthy");
  assert.equal(guardDecision(1, 1000, 1000), "expired");
  assert.equal(guardDecision(1, 1000, 1001), "expired");
  assert.equal(guardDecision(2, 1000, 999), "pending");
  assert.equal(guardDecision(3, 1000, 999), "default");
  assert.equal(guardDecision(0, 1000, 999), "settled-or-none");
});

test("healthTool reports the measured block, end block and the guard decision", async () => {
  const reads = fakeReads();
  const result = await healthTool(reads, 1, { contract: CONTRACT });

  assert.match(result.text, /^\[MEASURED\] makhzan_health — deal 1/);
  assert.match(result.text, /healthOf 1 \(healthy\)/);
  assert.match(result.text, /endBlock 172878/);
  assert.match(result.text, /blocksLeft 122/);
  assert.match(result.text, /MakhzanGuard decision: healthy/);
  assert.equal(result.facts.dealId, 1);
  assert.equal(result.facts.health, 1);
  assert.equal(result.facts.endBlock, 172878);
  assert.equal(result.facts.blocksLeft, 122);
  assert.equal(result.facts.decision, "healthy");
  assert.equal(result.facts.label, "MEASURED");
  assert.equal(result.facts.chainId, 420_420_777);
  assert.equal(result.facts.contract, CONTRACT);
  assert.ok(reads.calls.includes("deal:1"));
  assert.ok(reads.calls.includes("health:1"));
});

test("healthTool says the term is over instead of pretending the deal is healthy", async () => {
  const reads = fakeReads({
    blockNumber: async () => 173_000,
    deal: async (id) => ({
      id,
      owner: "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
      startBlock: 172_578,
      endBlock: 172_878,
      providerId: 1,
      flags: 0,
      root: `0x${"ab".repeat(32)}`,
      leafCount: 1024,
      size: 1_048_576,
      price: 500_000_000_000_000n,
      claimed: 0n,
    }),
  });
  const result = await healthTool(reads, 2, { contract: CONTRACT });

  assert.equal(result.facts.blocksLeft, -122);
  assert.equal(result.facts.decision, "expired");
  assert.match(result.text, /term over by 122 blocks/);
});

test("healthTool refuses an unknown deal rather than inventing state", async () => {
  const reads = fakeReads({
    deal: async () => {
      throw new Error("deal 9 does not exist on 0x6048 (owner is the zero address)");
    },
  });
  await assert.rejects(healthTool(reads, 9, { contract: CONTRACT }), /does not exist/);
});
