import { describe, expect, it } from "vitest";
import {
  ERROR_ABI,
  ERROR_SELECTORS,
  REFUSAL_ABI,
  REFUSAL_CALLS,
  REFUSAL_CALLER,
  calldataFor,
  decodeRefusal,
  selectorOf,
  signatureOf,
} from "../src/data/refusals";

/**
 * The selectors below are the ones the live contract returned on 2026-10-27
 * (`challenge` from a non-owner, `answer` from a non-provider, `createDeal` with bad params). The
 * implementation must derive them from the ABI fragments, so these values pin the derivation rather
 * than a table someone typed by hand.
 */
const LIVE = {
  notOwner: "0x30cd7471",
  notProvider: "0x3480e2b2",
  badParams: "0x019af637",
} as const;

describe("refusal selectors come from the ABI", () => {
  it("maps the three selectors the live chain returned to their names", () => {
    expect(ERROR_SELECTORS.get(LIVE.notOwner)).toBe("NotOwner()");
    expect(ERROR_SELECTORS.get(LIVE.notProvider)).toBe("NotProvider()");
    expect(ERROR_SELECTORS.get(LIVE.badParams)).toBe("BadParams()");
  });

  it("carries every custom error IMakhzan.sol declares, and nothing else", () => {
    expect(ERROR_SELECTORS.size).toBe(ERROR_ABI.length);
    expect([...ERROR_SELECTORS.values()]).toContain("AlreadySettled()");
    expect([...ERROR_SELECTORS.values()]).toContain("ProofRejected()");
    expect([...ERROR_SELECTORS.values()]).toContain("TransferFailed()");
  });

  it("builds a signature and a selector from a fragment, not from a string table", () => {
    const fragment = ERROR_ABI.find((item) => item.name === "NotOwner");
    expect(fragment).toBeDefined();
    expect(signatureOf(fragment!)).toBe("NotOwner()");
    expect(selectorOf("NotOwner()")).toBe(LIVE.notOwner);
    expect(selectorOf("BadParams()")).toBe(LIVE.badParams);
  });
});

describe("decoding a refusal", () => {
  it("names a known selector", () => {
    const decoded = decodeRefusal(LIVE.notOwner);
    expect(decoded.selector).toBe(LIVE.notOwner);
    expect(decoded.name).toBe("NotOwner");
    expect(decoded.signature).toBe("NotOwner()");
    expect(decoded.args).toEqual([]);
    expect(decoded.note).toMatch(/decoded from the ABI/i);
  });

  it("names the other two refusals the page runs", () => {
    expect(decodeRefusal(LIVE.notProvider).name).toBe("NotProvider");
    expect(decodeRefusal(LIVE.badParams).name).toBe("BadParams");
  });

  it("keeps an unknown selector visible instead of guessing", () => {
    const decoded = decodeRefusal("0xdeadbeef");
    expect(decoded.selector).toBe("0xdeadbeef");
    expect(decoded.name).toBeNull();
    expect(decoded.signature).toBeNull();
    expect(decoded.note).toMatch(/not in the ABI/i);
  });

  it("says so when there is no revert data at all", () => {
    for (const value of [null, undefined, "0x", "0x30cd"] as const) {
      const decoded = decodeRefusal(value);
      expect(decoded.selector).toBeNull();
      expect(decoded.name).toBeNull();
      expect(decoded.note).toMatch(/no four-byte selector/i);
    }
  });

  it("decodes parameters for an error that has them", () => {
    // error Paused(uint256 until) — not on this contract, so it proves the ABI path is generic.
    const data = `${selectorOf("Paused(uint256)")}${"0".repeat(62)}2a` as const;
    const withArgs = decodeRefusal(data, [
      { type: "error", name: "Paused", inputs: [{ name: "until", type: "uint256" }] },
    ]);
    expect(withArgs.name).toBe("Paused");
    expect(withArgs.args).toEqual([42n]);
  });
});

describe("the three calls the Verify page runs", () => {
  it("encodes challenge(1), answer(1, 0x, []) and createDeal with bad params", () => {
    const byId = new Map(REFUSAL_CALLS.map((call) => [call.id, call]));
    expect([...byId.keys()]).toEqual(["non-owner-challenge", "non-provider-answer", "bad-params-create"]);

    const challenge = byId.get("non-owner-challenge")!;
    expect(calldataFor(challenge)).toBe(
      "0xf3c72faa0000000000000000000000000000000000000000000000000000000000000001",
    );

    const answer = byId.get("non-provider-answer")!;
    const answerData = calldataFor(answer);
    expect(answerData.startsWith("0x9ad19c6d")).toBe(true);
    expect(answerData).toContain("0000000000000000000000000000000000000000000000000000000000000060");

    const badParams = byId.get("bad-params-create")!;
    expect(calldataFor(badParams).startsWith("0xc4f8f6f1")).toBe(true);
  });

  it("only encodes functions that exist in the fragment list", () => {
    for (const call of REFUSAL_CALLS) {
      expect(REFUSAL_ABI.some((item) => item.type === "function" && item.name === call.functionName)).toBe(true);
      expect(calldataFor(call).length).toBeGreaterThan(10);
    }
  });

  it("calls from the burn address, which is neither the owner nor provider 1", () => {
    expect(REFUSAL_CALLER).toBe("0x000000000000000000000000000000000000dEaD");
  });

  it("says what the contract checks first, so the expected refusal is explained", () => {
    const byId = new Map(REFUSAL_CALLS.map((call) => [call.id, call]));
    expect(byId.get("non-owner-challenge")!.expectedCheck).toMatch(/msg\.sender != d\.owner/);
    expect(byId.get("non-provider-answer")!.expectedCheck).toMatch(/msg\.sender != providers/);
    expect(byId.get("bad-params-create")!.expectedCheck).toMatch(/root == bytes32\(0\)/);
  });
});
