import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderVerify, verifyDeal, type DealVerifyInput, type DealLog } from "../src/dealVerify.ts";

const FIXTURES = join(import.meta.dirname, "fixtures/verify");

/** JSON has no bigint; the fixture stores every amount as a decimal string. */
function fixture(name: string): DealVerifyInput {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Record<string, any>;
  const logs: DealLog[] | null =
    raw.logs === null
      ? null
      : raw.logs.map((log: Record<string, any>) => ({
          ...log,
          slash: log.slash === undefined ? undefined : BigInt(log.slash),
          amount: log.amount === undefined ? undefined : BigInt(log.amount),
          toProvider: log.toProvider === undefined ? undefined : BigInt(log.toProvider),
          remainder: log.remainder === undefined ? undefined : BigInt(log.remainder),
          price: log.price === undefined ? undefined : BigInt(log.price),
        }));
  return {
    dealId: raw.dealId,
    blockSize: raw.blockSize,
    latestBlock: raw.latestBlock,
    deal: {
      ...raw.deal,
      price: BigInt(raw.deal.price),
      claimed: BigInt(raw.deal.claimed),
    },
    provider: { ...raw.provider, bond: BigInt(raw.provider.bond) },
    accrued: { accrued: BigInt(raw.accrued.accrued), claimable: BigInt(raw.accrued.claimable) },
    challenge: raw.challenge,
    health: raw.health,
    logs,
    logsError: raw.logsError,
  };
}

test("fixture deal 1: a passed challenge, a claim and a settle verify as PASS", () => {
  const report = verifyDeal(fixture("deal1.json"));
  assert.equal(report.result, "PASS");
  const text = renderVerify(report).join("\n");
  assert.match(text, /PASS provider 1 registered with bond 2400000000000000 units/);
  assert.match(text, /PASS deal 1 opened with root 0xd2ba07e1/);
  assert.match(text, /PASS challenge #1 issued at block 172281 index 451 deadline 172331/);
  assert.match(text, /PASS challenge #1 answered at block 172295/);
  assert.match(text, /PASS claimed 500000000000000 equals accrued 500000000000000/);
  assert.match(text, /PASS healthOf\(1\) = 0/);
  assert.match(text, /RESULT: PASS \(7 pass, 0 fail, 0 unknown, 0 pending\)/);
});

test("fixture deal 2: two challenges, answered then slashed, each paired in order", () => {
  const report = verifyDeal(fixture("deal2.json"));
  assert.equal(report.result, "PASS");
  const text = renderVerify(report).join("\n");
  assert.match(text, /challenge #1 issued at block 172584 index 29/);
  assert.match(text, /challenge #1 answered at block 172585/);
  assert.match(text, /challenge #2 issued at block 172602 index 623/);
  assert.match(text, /challenge #2 slashed at block 172658 .*: 600000000000000 units/);
  assert.match(text, /RESULT: PASS/);
});

test("logs unavailable is reported as UNKNOWN, never as a pass", () => {
  const input = fixture("deal1.json");
  input.logs = null;
  input.logsError = "eth_getLogs: block range too large";
  const report = verifyDeal(input);
  assert.equal(report.result, "INCOMPLETE");
  const text = renderVerify(report).join("\n");
  assert.match(text, /UNKNOWN challenge history unavailable: eth_getLogs: block range too large/);
  assert.doesNotMatch(text, /challenge #1 issued/);
  assert.doesNotMatch(text, /RESULT: PASS/);
});

test("a challenge with no outcome past its deadline fails", () => {
  const input = fixture("deal1.json");
  input.latestBlock = 172400;
  input.logs = (input.logs ?? []).filter((log) => log.kind !== "passed");
  // the deal is still marked settled by the fixture; keep health consistent so the challenge line is the failure
  const report = verifyDeal(input);
  assert.equal(report.result, "FAIL");
  assert.match(renderVerify(report).join("\n"), /FAIL challenge #1 unresolved: no ChallengePassed\/ChallengeFailed event/);
});

test("a challenge inside its window is PENDING, not PASS or FAIL", () => {
  const input = fixture("deal1.json");
  input.latestBlock = 172300;
  input.logs = (input.logs ?? []).filter((log) => log.kind !== "passed");
  const report = verifyDeal(input);
  assert.equal(report.result, "INCOMPLETE");
  assert.match(renderVerify(report).join("\n"), /PENDING challenge #1 still inside its window: deadline 172331, head 172300/);
});

test("claimed must equal accrued after settle", () => {
  const input = fixture("deal1.json");
  input.deal.claimed = 499_999_999_999_999n;
  const report = verifyDeal(input);
  assert.equal(report.result, "FAIL");
  assert.match(renderVerify(report).join("\n"), /claimed 499999999999999 does not equal accrued 500000000000000/);
});

test("a health value that contradicts the state fails", () => {
  const input = fixture("deal1.json");
  input.health = 1;
  const report = verifyDeal(input);
  assert.equal(report.result, "FAIL");
  assert.match(renderVerify(report).join("\n"), /healthOf\(1\) = 1, expected 0/);
});

test("a leaf count that does not match ceil(size/blockSize) fails", () => {
  const input = fixture("deal1.json");
  input.deal.leafCount = 1000;
  const report = verifyDeal(input);
  assert.equal(report.result, "FAIL");
  assert.match(renderVerify(report).join("\n"), /leafCount 1000 does not match ceil\(size\/1024\)=1024/);
});

test("an unregistered provider fails", () => {
  const input = fixture("deal1.json");
  input.provider = { id: 0, bond: 0n, activeDeals: 0, registered: false };
  const report = verifyDeal(input);
  assert.equal(report.result, "FAIL");
  assert.match(renderVerify(report).join("\n"), /FAIL provider 1 is not registered/);
});

test("a DealCreated log with a different root fails and names the field", () => {
  const input = fixture("deal1.json");
  const created = (input.logs ?? []).find((log) => log.kind === "created");
  assert.ok(created);
  created.root = `0x${"11".repeat(32)}`;
  const report = verifyDeal(input);
  assert.equal(report.result, "FAIL");
  assert.match(renderVerify(report).join("\n"), /DealCreated log does not match state: .*root 0x1111/);
});
