import { describe, expect, it } from "vitest";
import { decodeSlot0 } from "../src/data/peek";

const GOLDEN = "0x0000000003e80000000a000100000003002386f26fc1000007d004000000000a";

describe("decodeSlot0", () => {
  it("decodes the golden packed config word", () => {
    expect(decodeSlot0(GOLDEN)).toEqual({
      challengeWindowBlocks: 10,
      challengeBlockSize: 1024,
      slashBps: 2000,
      minBondUnits: "10000000000000000",
      nextDealId: 3,
      providerCount: 1,
      minDurationBlocks: 10,
      maxDurationBlocks: 1000,
    });
  });

  it("reads the first declared field from the least-significant end", () => {
    const word = `0x${"00".repeat(28)}0000000a`;
    expect(decodeSlot0(word).challengeWindowBlocks).toBe(10);
  });

  it("rejects a word that is not 32 bytes", () => {
    expect(() => decodeSlot0("0x00")).toThrow(/32 bytes/);
    expect(() => decodeSlot0(`0x${"00".repeat(31)}`)).toThrow(/32 bytes/);
    expect(() => decodeSlot0(`0x${"00".repeat(33)}`)).toThrow(/32 bytes/);
    expect(() => decodeSlot0("0xnothex")).toThrow();
  });

  it("returns the same numbers as the evidence config", () => {
    const decoded = decodeSlot0(GOLDEN);
    expect(decoded.minBondUnits).toBe("10000000000000000");
    expect(String(decoded.providerCount)).toBe("1");
  });
});
