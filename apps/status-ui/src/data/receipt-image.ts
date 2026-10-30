/**
 * A PNG of the receipt, drawn on a canvas with no library.
 *
 * `receiptImageText` is the whole content as text, so a test can check the image says exactly what
 * the page says without a canvas. `drawReceipt` paints it; `downloadReceiptPng` hands the browser a
 * download. If the browser cannot give a 2D context, the caller is told instead of getting a blank
 * file.
 */
import { formatNative, formatWeiAsNative } from "./labels";
import type { Receipt } from "./receipt";

export const RECEIPT_IMAGE = { width: 1080, height: 1350 } as const;

export interface ReceiptImageText {
  heading: string;
  subheading: string;
  rows: readonly (readonly [string, string])[];
  footer: string;
  resolveHash: string | null;
}

const pair = (value: string, unit: string): string => `${value} ${unit}`;

/** The image, as text: the same four numbers and the same footer the page shows. */
export function receiptImageText(receipt: Receipt): ReceiptImageText {
  const rows: (readonly [string, string])[] = [
    ["Bond before", pair(formatNative(receipt.bondBeforeUnits), "tPOT")],
    ["Slash", pair(formatNative(receipt.slashUnits), "tPOT")],
    ["Bond after", pair(formatNative(receipt.bondAfterUnits), "tPOT")],
    ["Owner credited", pair(formatWeiAsNative(receipt.ownerCreditWei), "tPOT")],
  ];
  if (receipt.slashedRound !== null) {
    rows.push(
      ["Slashed round index", String(receipt.slashedRound.index)],
      ["Challenge block", String(receipt.slashedRound.startBlock)],
      ["Deadline", String(receipt.slashedRound.deadline)],
    );
  }
  const last = receipt.transactions[receipt.transactions.length - 1];
  return {
    heading: "MAKHZAN",
    subheading: `Deal ${receipt.dealId} · ${receipt.state} · ${receipt.evidenceId}`,
    rows,
    footer:
      last === undefined
        ? "no transactions recorded · no explorer is configured for this network"
        : `${last.id} · no explorer is configured for this network`,
    resolveHash: receipt.slashedRound?.resolveTx ?? null,
  };
}

export interface DrawableContext {
  fillStyle: string;
  font: string;
  textAlign: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
}

/** Paints the receipt. Returns the size it used, so the caller can size the canvas first. */
export function drawReceipt(
  ctx: CanvasRenderingContext2D | DrawableContext,
  receipt: Receipt,
): { width: number; height: number } {
  const { width, height } = RECEIPT_IMAGE;
  const text = receiptImageText(receipt);
  const ink = "#0c0d10";
  const white = "#ffffff";
  const dim = "#8e94a0";
  const gold = "#d9a441";

  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "left";
  ctx.font = "600 44px 'JetBrains Mono', 'IBM Plex Mono', monospace";
  ctx.fillStyle = gold;
  ctx.fillText(text.heading, 80, 120);

  ctx.font = "400 28px 'Instrument Sans', 'Space Grotesk', sans-serif";
  ctx.fillStyle = dim;
  ctx.fillText(text.subheading, 80, 170);

  let y = 260;
  for (const [field, value] of text.rows) {
    ctx.font = "400 26px 'Instrument Sans', 'Space Grotesk', sans-serif";
    ctx.fillStyle = dim;
    ctx.fillText(field, 80, y);
    ctx.font = "500 30px 'JetBrains Mono', 'IBM Plex Mono', monospace";
    ctx.fillStyle = white;
    ctx.fillText(value, 460, y);
    y += 70;
  }

  ctx.fillStyle = dim;
  ctx.font = "400 22px 'Instrument Sans', 'Space Grotesk', sans-serif";
  if (text.resolveHash !== null) {
    ctx.font = "400 20px 'JetBrains Mono', 'IBM Plex Mono', monospace";
    ctx.fillText(`resolve ${text.resolveHash}`, 80, height - 130);
  }
  ctx.font = "400 22px 'Instrument Sans', 'Space Grotesk', sans-serif";
  ctx.fillText(text.footer, 80, height - 90);

  return { width, height };
}

export type ImageResult = "downloaded" | "unsupported";

/** Draws the receipt and starts a download. A browser without a 2D context gets a clear answer. */
export function downloadReceiptPng(receipt: Receipt, doc: Document = document): ImageResult {
  const canvas = doc.createElement("canvas");
  canvas.width = RECEIPT_IMAGE.width;
  canvas.height = RECEIPT_IMAGE.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return "unsupported";

  drawReceipt(ctx, receipt);
  const name = `makhzan-receipt-deal-${receipt.dealId}.png`;
  const save = (href: string): void => {
    const link = doc.createElement("a");
    link.href = href;
    link.download = name;
    link.click();
    if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(href);
  };

  if (typeof canvas.toBlob === "function") {
    canvas.toBlob((blob) => {
      if (blob === null) return;
      save(URL.createObjectURL(blob));
    }, "image/png");
    return "downloaded";
  }
  save(canvas.toDataURL("image/png"));
  return "downloaded";
}
