import { describe, expect, it } from "vitest";
import run2 from "../public/evidence/portaldot-live-run2.json";
import { parseEvidence } from "../src/data/schema";

describe("the recorded live run", () => {
  const bundle = parseEvidence(run2);

  it("records one provider with the post-slash bond", () => {
    expect(bundle.providers).toHaveLength(1);
    expect(bundle.providers[0]!.id).toBe(1);
    expect(bundle.providers[0]!.bondUnits).toBe("2400000000000000");
    expect(bundle.providers[0]!.registered).toBe(true);
    expect(bundle.config.providerCount).toBe(1);
    expect(bundle.config.nextDealId).toBe(2);
  });

  it("records both deals as settled with health 0", () => {
    expect(bundle.deals.map((deal) => deal.id)).toEqual([1, 2]);
    for (const deal of bundle.deals) {
      expect(deal.state).toBe("settled");
      expect(deal.health).toBe(0);
      expect(deal.priceUnits).toBe("500000000000000");
      expect(deal.claimedUnits).toBe("500000000000000");
    }
  });

  it("carries two passed rounds and one slash that balances exactly", () => {
    expect(bundle.rounds.map((round) => round.status)).toEqual(["passed", "passed", "failed"]);
    const slash = bundle.rounds[2]!;
    expect(slash.slashUnits).toBe("600000000000000");
    expect(BigInt(slash.bondBeforeUnits) - BigInt(slash.slashUnits)).toBe(BigInt(slash.bondAfterUnits));
    expect(BigInt(slash.ownerCreditWei)).toBe(6_000_000_000_000_000_000n);
    expect(slash.resolveTx).toBe("0x97da004710a5e01ea97b9d602f5b8ef5c5382ea5800c5d52b02951cb6809e8a3");
  });

  it("keeps the pass answer, slash resolve, claims and settles with blocks", () => {
    const byId = new Map(bundle.transactions.map((tx) => [tx.id, tx]));
    expect(byId.get("deploy")?.block).toBe(171308);
    expect(byId.get("register")?.block).toBe(172240);
    expect(byId.get("answer-2a")?.block).toBe(172585);
    expect(byId.get("resolve-2b")?.block).toBe(172658);
    expect(byId.get("claim-1")?.block).toBe(172557);
    expect(byId.get("settle-1")?.block).toBe(172564);
    expect(byId.get("claim-2")?.block).toBe(172881);
    expect(byId.get("settle-2")?.block).toBe(172887);
    expect(byId.get("answer-2a")?.hash).toBe("0xb1ddb1fb54e6f4c4405cfcb85640cae51808ef6ce7509f0e14acc422c3621210");
    expect(byId.get("answer-1")?.receipt).toBe("not-recorded");
  });
});
