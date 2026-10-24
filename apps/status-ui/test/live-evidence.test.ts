import { describe, expect, it } from "vitest";
import liveJson from "../public/evidence/portaldot-live-2026-10-24.json";
import { parseEvidence } from "../src/data/schema";

describe("published live evidence", () => {
  it("accepts the live bundle, including a fresh deployment with nextDealId 0", () => {
    const bundle = parseEvidence(liveJson);
    expect(bundle.id).toBe("portaldot-live-2026-10-24");
    expect(bundle.environment).toBe("portaldot-testnet");
    expect(bundle.chain.chainId).toBe(420420777);
    expect(bundle.deployment.address).toBe("0x60481DFcFCA34A8F095939D9675eC715127B2e44");
    expect(bundle.deployment.block).toBe(171308);
    expect(bundle.config.nextDealId).toBe(0);
    expect(bundle.config.providerCount).toBe(0);
    expect(bundle.config.challengeWindowBlocks).toBe(50);
    expect(bundle.config.minDurationBlocks).toBe(100);
    expect(bundle.config.maxDurationBlocks).toBe(100800);
    expect(bundle.deals).toHaveLength(0);
    expect(bundle.rounds).toHaveLength(0);
  });

  it("keeps source verification explicitly false", () => {
    const bundle = parseEvidence(liveJson);
    expect(bundle.deployment.codeVerified.method).toBe("runtime-code-hash");
    expect(bundle.deployment.codeVerified.sourceVerified).toBe(false);
  });
});
