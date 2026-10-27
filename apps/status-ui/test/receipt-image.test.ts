import { describe, expect, it, vi } from "vitest";
import { drawReceipt, receiptImageText, RECEIPT_IMAGE } from "../src/data/receipt-image";
import { receiptFor } from "../src/data/receipt";
import type { EvidenceBundle } from "../src/data/schema";
import run2 from "../public/evidence/portaldot-live-run2.json";

const bundle = run2 as unknown as EvidenceBundle;
const deal2 = receiptFor(bundle, 2)!;
const deal1 = receiptFor(bundle, 1)!;

interface FakeCtx {
  fillStyle: string;
  font: string;
  textAlign: string;
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  drawn: string[];
}

function fakeCtx(): FakeCtx {
  const drawn: string[] = [];
  return {
    fillStyle: "",
    font: "",
    textAlign: "",
    fillRect: vi.fn(),
    fillText: vi.fn((text: string) => {
      drawn.push(String(text));
    }),
    drawn,
  };
}

describe("the receipt image text", () => {
  it("carries the numbers a reader needs, and the deal it belongs to", () => {
    const text = receiptImageText(deal2);
    const flat = [text.heading, text.subheading, text.footer, ...text.rows.flatMap((row) => row)]
      .join(" | ")
      .replace(/\s+/g, " ");
    expect(flat).toContain("Deal 2");
    expect(flat).toContain("Bond before");
    expect(flat).toContain("30 tPOT");
    expect(flat).toContain("Slash");
    expect(flat).toContain("6 tPOT");
    expect(flat).toContain("Bond after");
    expect(flat).toContain("24 tPOT");
    expect(flat).toContain("Owner credited");
    expect(flat).toMatch(/no explorer/i);
    expect(flat).toContain(deal2.transactions.at(-1)!.id);
  });

  it("says zero on the deal that was answered in time", () => {
    const text = receiptImageText(deal1);
    const rows = new Map(text.rows);
    expect(rows.get("Bond before")).toBe("30 tPOT");
    expect(rows.get("Bond after")).toBe("30 tPOT");
    expect(rows.get("Slash")).toBe("0 tPOT");
    expect(rows.get("Owner credited")).toBe("0 tPOT");
  });
});

describe("drawing the receipt", () => {
  it("fills the page and writes every row onto it", () => {
    const ctx = fakeCtx();
    const size = drawReceipt(ctx as unknown as CanvasRenderingContext2D, deal2);

    expect(size.width).toBe(RECEIPT_IMAGE.width);
    expect(size.height).toBe(RECEIPT_IMAGE.height);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, RECEIPT_IMAGE.width, RECEIPT_IMAGE.height);

    const drawn = ctx.drawn.join(" | ");
    expect(drawn).toContain("MAKHZAN");
    expect(drawn).toContain("Deal 2");
    expect(drawn).toContain("Bond before");
    expect(drawn).toContain("30 tPOT");
    expect(drawn).toContain("24 tPOT");
    expect(drawn).toContain("6 tPOT");
    expect(drawn).toMatch(/no explorer/i);
  });

  it("does not draw a hash it does not have", () => {
    const ctx = fakeCtx();
    drawReceipt(ctx as unknown as CanvasRenderingContext2D, {
      ...deal2,
      slashedRound:
        deal2.slashedRound === null ? null : { ...deal2.slashedRound, resolveTx: null },
      transactions: deal2.transactions.map((tx) => ({ ...tx, hash: null })),
    });
    expect(ctx.drawn.join(" | ")).not.toMatch(/0x[0-9a-f]{6,}/i);
  });
});
