import { describe, expect, it } from "vitest";
import { parseEvidence, parseManifest } from "../src/data/schema";
import { cloneFixture } from "../src/test/fixtures";

const noExtraKeys = (bundle: Record<string, unknown>) => bundle;

describe("parseEvidence", () => {
  it("accepts the published fixture and returns the same identity", () => {
    const bundle = parseEvidence(cloneFixture());
    expect(bundle.schema).toBe("makhzan.evidence/v0");
    expect(bundle.id).toBe("local-anvil-2026-10-23");
    expect(bundle.deals).toHaveLength(2);
    expect(bundle.rounds).toHaveLength(2);
  });

  it("rejects an unknown top-level key", () => {
    const raw = noExtraKeys({ ...cloneFixture(), extra: true });
    expect(() => parseEvidence(raw)).toThrow(/unknown key: extra/);
  });

  it("rejects a missing top-level key", () => {
    const raw = cloneFixture() as unknown as Record<string, unknown>;
    delete raw.limits;
    expect(() => parseEvidence(raw)).toThrow(/limits/);
  });

  it("rejects a wrong type", () => {
    const raw = cloneFixture() as unknown as Record<string, unknown>;
    (raw.chain as Record<string, unknown>).chainId = "420420777";
    expect(() => parseEvidence(raw)).toThrow(/chain\.chainId/);
  });

  it("rejects a bad address length", () => {
    const raw = cloneFixture();
    raw.deployment.address = "0x1234" as typeof raw.deployment.address;
    expect(() => parseEvidence(raw)).toThrow(/deployment\.address/);
  });

  it("rejects a bad hash length", () => {
    const raw = cloneFixture();
    raw.deployment.codeHash = "0xdead" as typeof raw.deployment.codeHash;
    expect(() => parseEvidence(raw)).toThrow(/deployment\.codeHash/);
  });

  it("rejects a duplicate id inside one collection", () => {
    const raw = cloneFixture();
    raw.deals.push(structuredClone(raw.deals[0]!));
    expect(() => parseEvidence(raw)).toThrow(/duplicate deal id 1/);
  });

  it("rejects an unsupported schema version", () => {
    const raw = cloneFixture() as unknown as Record<string, unknown>;
    raw.schema = "makhzan.evidence/v1";
    expect(() => parseEvidence(raw)).toThrow(/schema/);
  });

  it("rejects a config that disagrees with packed slot 0", () => {
    const raw = cloneFixture();
    raw.config.nextDealId = 4;
    expect(() => parseEvidence(raw)).toThrow(/slot0/);
  });

  it("rejects a passed round with a bond change", () => {
    const raw = cloneFixture();
    raw.rounds[0]!.bondAfterUnits = "9000000000000000";
    expect(() => parseEvidence(raw)).toThrow(/passed round 1/);
  });

  it("rejects a passed round whose read-back still shows the challenge open", () => {
    const raw = cloneFixture();
    raw.rounds[0]!.readBack.challengeOpenAfter = true;
    expect(() => parseEvidence(raw)).toThrow(/challenge open/);
  });

  it("rejects a failed round with wrong slash arithmetic", () => {
    const raw = cloneFixture();
    raw.rounds[1]!.bondAfterUnits = "7000000000000000";
    expect(() => parseEvidence(raw)).toThrow(/slash|arithmetic/);
  });

  it("rejects a non-integer amount", () => {
    const raw = cloneFixture();
    raw.deals[0]!.priceUnits = "1.5";
    expect(() => parseEvidence(raw)).toThrow(/priceUnits/);
  });

  it("rejects a zero-padded amount", () => {
    const raw = cloneFixture();
    raw.deals[0]!.priceUnits = "010000000000000000";
    expect(() => parseEvidence(raw)).toThrow(/priceUnits/);
  });

  it("rejects a deal that references a missing provider", () => {
    const raw = cloneFixture();
    raw.deals[0]!.providerId = 9;
    expect(() => parseEvidence(raw)).toThrow(/provider/);
  });

  it("rejects a round id that belongs to another deal", () => {
    const raw = cloneFixture();
    raw.deals[0]!.roundIds = [2];
    expect(() => parseEvidence(raw)).toThrow(/round 2|belongs/);
  });

  it("rejects transaction stages that are out of order", () => {
    const raw = cloneFixture();
    raw.transactions[0]!.stages = ["included", "submitted", "executed", "finalized", "readBack"];
    expect(() => parseEvidence(raw)).toThrow(/stages/);
  });

  it("rejects an unknown receipt state", () => {
    const raw = cloneFixture() as unknown as Record<string, unknown>;
    (raw.transactions as Record<string, unknown>[])[0]!.receipt = "maybe";
    expect(() => parseEvidence(raw)).toThrow(/receipt/);
  });
});

describe("parseManifest", () => {
  const manifest = () => ({
    schema: "makhzan.evidence-index/v0",
    current: "local-anvil-2026-10-23",
    files: [
      {
        id: "local-anvil-2026-10-23",
        url: "/evidence/local-anvil-2026-10-23.json",
        sha256: "0xfec974a18e7471bc51249b37494ec2a9b19deaf92c4a711289bb03e90fbff323",
        environment: "anvil-local",
        generatedAt: "2026-10-23T08:21:15Z",
      },
    ],
  });

  it("accepts a well-formed manifest", () => {
    expect(parseManifest(manifest()).current).toBe("local-anvil-2026-10-23");
  });

  it("rejects an unsupported manifest schema", () => {
    expect(() => parseManifest({ ...manifest(), schema: "makhzan.evidence-index/v1" })).toThrow(/manifest/);
  });

  it("rejects a current id that is not listed", () => {
    expect(() => parseManifest({ ...manifest(), current: "other" })).toThrow(/current/);
  });

  it("rejects a short sha256", () => {
    const raw = manifest();
    raw.files[0]!.sha256 = "0xdead";
    expect(() => parseManifest(raw)).toThrow(/sha256/);
  });
});
