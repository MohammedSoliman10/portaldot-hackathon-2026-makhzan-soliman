import { describe, expect, it } from "vitest";
import {
  receiptFor,
  receiptLink,
  receiptRows,
  transactionHref,
} from "../src/data/receipt";
import type { EvidenceBundle } from "../src/data/schema";
import run2 from "../public/evidence/portaldot-live-run2.json";

const bundle = run2 as unknown as EvidenceBundle;
const SLASH_TX = "0x97da004710a5e01ea97b9d602f5b8ef5c5382ea5800c5d52b02951cb6809e8a3";

describe("a receipt for one deal", () => {
  it("reads deal 1: 30 tPOT to 30 tPOT, no slash, no credit", () => {
    const receipt = receiptFor(bundle, 1);
    expect(receipt).not.toBeNull();
    expect(receipt!.dealId).toBe(1);
    expect(receipt!.state).toBe("settled");
    expect(receipt!.health).toBe(0);
    expect(receipt!.bondBeforeUnits).toBe("3000000000000000");
    expect(receipt!.bondAfterUnits).toBe("3000000000000000");
    expect(receipt!.slashUnits).toBe("0");
    expect(receipt!.ownerCreditWei).toBe("0");
    expect(receipt!.slashPercent).toBe(0);
    expect(receipt!.rounds).toHaveLength(1);
    expect(receipt!.rounds[0]!.outcome).toBe("passed");
    expect(receipt!.slashedRound).toBeNull();
  });

  it("reads deal 2: 30 tPOT to 24 tPOT, exactly 6 slashed and 6 credited", () => {
    const receipt = receiptFor(bundle, 2);
    expect(receipt).not.toBeNull();
    expect(receipt!.bondBeforeUnits).toBe("3000000000000000");
    expect(receipt!.bondAfterUnits).toBe("2400000000000000");
    expect(receipt!.slashUnits).toBe("600000000000000");
    expect(receipt!.ownerCreditWei).toBe("6000000000000000000");
    expect(receipt!.slashPercent).toBe(20);
    expect(receipt!.rounds.map((round) => round.outcome)).toEqual(["passed", "slashed"]);
    expect(receipt!.slashedRound?.index).toBe(623);
    expect(receipt!.slashedRound?.resolveTx).toBe(SLASH_TX);
  });

  it("keeps only the transactions that belong to the deal, in evidence order", () => {
    expect(receiptFor(bundle, 1)!.transactions.map((tx) => tx.id)).toEqual([
      "create-1",
      "challenge-1",
      "answer-1",
      "claim-1",
      "settle-1",
    ]);
    expect(receiptFor(bundle, 2)!.transactions.map((tx) => tx.id)).toEqual([
      "create-2",
      "challenge-2a",
      "answer-2a",
      "challenge-2b",
      "resolve-2b",
      "claim-2",
      "settle-2",
    ]);
  });

  it("returns null for a deal that is not in the evidence", () => {
    expect(receiptFor(bundle, 3)).toBeNull();
    expect(receiptFor(bundle, 0)).toBeNull();
    expect(receiptFor(null, 1)).toBeNull();
  });

  it("links to the hash route, so a copied link works on any static host", () => {
    expect(receiptLink("https://status-ui-one.vercel.app", 2)).toBe(
      "https://status-ui-one.vercel.app/#/receipt/2",
    );
    expect(receiptLink("https://status-ui-one.vercel.app", 1)).toBe(
      "https://status-ui-one.vercel.app/#/receipt/1",
    );
  });

  it("points a hash at the explorer when one exists, and at the evidence file when none does", () => {
    expect(transactionHref(bundle, SLASH_TX)).toBe("/evidence/portaldot-live-run2.json");
    const withExplorer = {
      ...bundle,
      chain: { ...bundle.chain, explorer: "https://explorer.example" },
    };
    expect(transactionHref(withExplorer, SLASH_TX)).toBe(`https://explorer.example/tx/${SLASH_TX}`);
  });
});

describe("the rows a receipt shows", () => {
  it("states bond before, the exact slash, bond after and the owner credit", () => {
    const rows = receiptRows(receiptFor(bundle, 2)!);
    const byField = new Map(rows.map((row) => [row.field, row]));
    expect(byField.get("Bond before")?.value).toBe("30");
    expect(byField.get("Bond before")?.unit).toBe("tPOT");
    expect(byField.get("Slash")?.value).toBe("6");
    expect(byField.get("Slash")?.detail).toContain("600,000,000,000,000 units");
    expect(byField.get("Slash")?.detail).toContain("20%");
    expect(byField.get("Bond after")?.value).toBe("24");
    expect(byField.get("Owner credited")?.value).toBe("6");
    expect(byField.get("Owner credited")?.detail).toContain("6,000,000,000,000,000,000 wei");
    for (const row of rows) expect(row.label).toBe("REPORTED");
  });

  it("says zero plainly on a deal that was answered in time", () => {
    const rows = receiptRows(receiptFor(bundle, 1)!);
    const byField = new Map(rows.map((row) => [row.field, row]));
    expect(byField.get("Bond before")?.value).toBe("30");
    expect(byField.get("Bond after")?.value).toBe("30");
    expect(byField.get("Slash")?.value).toBe("0");
    expect(byField.get("Owner credited")?.value).toBe("0");
  });

  it("names the challenge, the deadline and the resolve block for the slashed round", () => {
    const rows = receiptRows(receiptFor(bundle, 2)!);
    const byField = new Map(rows.map((row) => [row.field, row]));
    expect(byField.get("Slashed round index")?.value).toBe("623");
    expect(byField.get("Challenge block")?.value).toBe("172,602");
    expect(byField.get("Deadline")?.value).toBe("172,652");
    expect(byField.get("Resolve block")?.value).toBe("172,658");
  });
});
