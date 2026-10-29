import { describe, expect, it, vi } from "vitest";
import {
  effectiveBondUnits,
  guardDecision,
  lockOf,
  lockStatusName,
  releaseVerdict,
} from "../src/data/gate";
import type { ReadClient } from "../src/data/client";

const GATE = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const PAYER = "0x0948EBD7637D1C32858a6FC5D947E85A6600205C";
const PAYEE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function client(lock: readonly unknown[]): ReadClient {
  return {
    readContract: vi.fn(async () => lock),
    getChainId: vi.fn(async () => 420420777),
    getCode: vi.fn(async () => "0x6000"),
    getBlockNumber: vi.fn(async () => 1n),
    getBalance: vi.fn(async () => 0n),
    getBlock: vi.fn(async () => null),
  } as unknown as ReadClient;
}

describe("lockOf", () => {
  it("reads the five fields in the order the struct stores them", async () => {
    const result = await lockOf(
      client([PAYER, 5_000_000_000_000_000n, PAYEE, 24_000_000_000_000_000n, 1]),
      GATE,
      2,
    );
    expect(result.error).toBeNull();
    expect(result.value).toEqual({
      payer: PAYER,
      payee: PAYEE,
      amountUnits: "5000000000000000",
      minBondUnits: "24000000000000000",
      status: "locked",
      statusCode: 1,
    });
    expect(result.label).toBe("MEASURED");
  });

  it("names every status, and refuses one it does not know", () => {
    expect(lockStatusName(0)).toBe("none");
    expect(lockStatusName(1)).toBe("locked");
    expect(lockStatusName(2)).toBe("released");
    expect(lockStatusName(3)).toBe("refunded");
    expect(lockStatusName(4)).toBe("unknown (4)");
  });

  it("reports a status it cannot name instead of guessing", async () => {
    const result = await lockOf(client([PAYER, 1n, PAYEE, 0n, 9]), GATE, 1);
    expect(result.value?.status).toBe("unknown (9)");
    expect(result.value?.statusCode).toBe(9);
  });

  it("returns an error, not a throw, when the read fails", async () => {
    const broken = { ...client([]), readContract: vi.fn(async () => { throw new Error("rpc down"); }) } as unknown as ReadClient;
    const result = await lockOf(broken, GATE, 1);
    expect(result.value).toBeNull();
    expect(result.error?.message).toMatch(/rpc down/);
  });
});

describe("the guard decision", () => {
  it("maps every health value to the error the library would raise", () => {
    expect(guardDecision(1, 100, 200)).toBe("healthy");
    expect(guardDecision(2, 100, 200)).toBe("pending");
    expect(guardDecision(3, 100, 200)).toBe("default");
    expect(guardDecision(0, 100, 200)).toBe("settled-or-none");
  });

  it("treats health 1 at or past the end block as expired, because healthOf never reads it", () => {
    expect(guardDecision(1, 200, 200)).toBe("expired");
    expect(guardDecision(1, 201, 200)).toBe("expired");
    expect(guardDecision(1, 199, 200)).toBe("healthy");
  });
});

describe("the provider bond the gate counts", () => {
  it("counts the payee's bond only when its provider id is the deal's provider", () => {
    expect(effectiveBondUnits({ id: 1, bondUnits: "24000000000000000" }, 1)).toBe("24000000000000000");
  });

  it("reads as zero for a payee that is not the deal's provider, as the contract does", () => {
    expect(effectiveBondUnits({ id: 2, bondUnits: "24000000000000000" }, 1)).toBe("0");
    expect(effectiveBondUnits({ id: 0, bondUnits: "1" }, 1)).toBe("0");
  });

  it("reads as zero when there is no provider record or no deal", () => {
    expect(effectiveBondUnits(null, 1)).toBe("0");
    expect(effectiveBondUnits({ id: 1, bondUnits: "9" }, null)).toBe("0");
  });
});

describe("release, as the contract would decide it", () => {
  const base = { status: "locked" as const, decision: "healthy" as const, minBondUnits: "0", bondUnits: "0" };

  it("passes only while the lock is held, the guard is healthy and the bond floor is met", () => {
    expect(releaseVerdict(base)).toEqual({ kind: "pass" });
    expect(releaseVerdict({ ...base, minBondUnits: "10", bondUnits: "10" })).toEqual({ kind: "pass" });
    expect(releaseVerdict({ ...base, minBondUnits: "10", bondUnits: "11" })).toEqual({ kind: "pass" });
  });

  it("refuses a lock that is not held, before it looks at the deal at all", () => {
    for (const status of ["none", "released", "refunded"] as const) {
      expect(releaseVerdict({ ...base, status, decision: "default" })).toEqual({
        kind: "revert",
        name: "NotLocked",
      });
    }
  });

  it("names the guard error for each blocked state", () => {
    expect(releaseVerdict({ ...base, decision: "pending" })).toEqual({ kind: "revert", name: "Pending" });
    expect(releaseVerdict({ ...base, decision: "default" })).toEqual({ kind: "revert", name: "Default" });
    expect(releaseVerdict({ ...base, decision: "settled-or-none" })).toEqual({
      kind: "revert",
      name: "SettledOrNone",
    });
    expect(releaseVerdict({ ...base, decision: "expired" })).toEqual({ kind: "revert", name: "Expired" });
  });

  it("refuses a bond below the floor, and only when a floor is set", () => {
    expect(releaseVerdict({ ...base, minBondUnits: "24", bondUnits: "23" })).toEqual({
      kind: "revert",
      name: "BondTooLow",
    });
    expect(releaseVerdict({ ...base, minBondUnits: "0", bondUnits: "0" })).toEqual({ kind: "pass" });
  });

  it("puts the guard before the bond floor, as release does", () => {
    expect(releaseVerdict({ ...base, decision: "expired", minBondUnits: "10", bondUnits: "0" })).toEqual({
      kind: "revert",
      name: "Expired",
    });
  });
});
