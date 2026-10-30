import { useState } from "react";
import { useParams } from "react-router-dom";
import { BlockLink } from "../components/BlockLink";
import { CopyText } from "../components/CopyText";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, formatWei } from "../data/labels";
import { receiptFor, receiptLink, receiptRows, transactionHref, type ReceiptRow } from "../data/receipt";
import { downloadReceiptPng, RECEIPT_IMAGE } from "../data/receipt-image";
import { Card } from "../components/shared/Card";
import { Chip } from "../components/shared/Chip";

const slug = (field: string): string =>
  field
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function Row({ field, value, unit, detail, label, source }: ReceiptRow) {
  return (
    <tr data-testid={`receipt-row-${slug(field)}`}>
      <td className="py-3.5 break-words text-slate-700">
        <span className="font-medium">{field}</span>
        <p className="mono mt-1 break-all font-mono text-[10px] text-slate-400 sm:hidden">{source}</p>
      </td>
      <td className="numeral py-3.5 font-mono">
        <span className="font-semibold text-slate-900">{value}</span>
        {unit ? <span className="text-slate-500"> {unit}</span> : null}
        {detail ? <p className="mono mt-1 break-words font-mono text-xs text-slate-500">{detail}</p> : null}
      </td>
      <td className="py-3.5">
        <Chip label={label} />
      </td>
      <td className="mono hidden py-3.5 break-words font-mono text-xs text-slate-400 sm:table-cell">{source}</td>
    </tr>
  );
}

/**
 * One deal as a receipt you can send someone: the bond before and after, the exact slash, the owner
 * credit, and every transaction hash with somewhere to look it up. Every number is REPORTED from the
 * evidence file, because a receipt records what happened rather than what the chain says now.
 */
export function Receipt() {
  const { id } = useParams();
  const evidence = useEvidence();
  const bundle = evidence.bundle;
  const dealId = id === undefined ? Number.NaN : Number(id);
  const receipt =
    Number.isSafeInteger(dealId) && dealId > 0 ? receiptFor(bundle, dealId) : null;
  const [image, setImage] = useState<"idle" | "downloaded" | "unsupported">("idle");

  if (bundle === null || receipt === null) {
    const held = bundle?.deals.map((deal) => deal.id).join(", ") ?? "";
    return (
      <section className="space-y-6">
        <header>
          <p className="eyebrow">07 / receipt</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {bundle === null ? "The evidence has not loaded" : `No receipt for deal ${id}`}
          </h1>
          <p className="mt-3 max-w-[68ch] text-slate-600 leading-relaxed">
            {bundle === null
              ? "There is no evidence bundle on this page yet, so there is nothing to print. Reload when the evidence file is reachable; no number here is invented."
              : `The recorded evidence holds deals ${held}. A receipt exists only for a deal that was actually created on this deployment.`}
          </p>
        </header>
        <Card className="p-6">
          <p className="text-sm font-mono text-slate-700">
            Available receipts:{" "}
            <a className="link-quiet underline hover:text-amber-700 transition-colors" href="/#/receipt/1">
              deal 1
            </a>{" "}
            ·{" "}
            <a className="link-quiet underline hover:text-amber-700 transition-colors" href="/#/receipt/2">
              deal 2
            </a>
          </p>
        </Card>
      </section>
    );
  }

  const link = receiptLink(window.location.origin, receipt.dealId);
  const rows = receiptRows(receipt);
  const source = `evidence/${receipt.evidenceId}.json`;
  const hasExplorer = bundle.chain.explorer !== null && bundle.chain.explorer.trim() !== "";

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">07 / receipt</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Receipt — deal {receipt.dealId}</h1>
        <p className="mt-3 max-w-[68ch] text-slate-600 leading-relaxed">
          {receipt.slashUnits === "0"
            ? `Deal ${receipt.dealId} is ${receipt.state}, and no slash was recorded on it: every challenge was answered before its deadline, so the bond came back whole.`
            : `Deal ${receipt.dealId} is ${receipt.state}, and one challenge was left unanswered. The bond went from ${formatNative(receipt.bondBeforeUnits)} tPOT to ${formatNative(receipt.bondAfterUnits)} tPOT, and the owner was credited the cut.`}{" "}
          This page is a record of what the chain did, not a live read: the bond now lives on{" "}
          <a className="link-quiet underline hover:text-amber-700 transition-colors" href="/proof">
            the proof page
          </a>
          .
        </p>
      </header>

      <Card as="section" aria-labelledby="share-heading" className="p-6">
        <h2 id="share-heading" className="eyebrow text-slate-700 font-semibold">
          Send it, or save it
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <CopyText text={link} />
          <button
            type="button"
            onClick={() => setImage(downloadReceiptPng(receipt))}
            className="min-h-[44px] rounded-full border border-slate-200 bg-white px-5 py-2 font-mono text-xs font-semibold text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            Download image (PNG)
          </button>
          <span className="font-mono text-xs text-slate-500">
            {image === "downloaded"
              ? "Image saved to downloads."
              : image === "unsupported"
                ? "This browser cannot export an image. Use the link above."
                : `${RECEIPT_IMAGE.width}×${RECEIPT_IMAGE.height} PNG with the numbers above`}
          </span>
        </div>
      </Card>

      <Card as="section" aria-labelledby="bond-heading" className="p-6">
        <h2 id="bond-heading" className="eyebrow text-slate-700 font-semibold">
          The bond before and after
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <colgroup>
              <col className="w-[30%] sm:w-[24%]" />
              <col className="w-[45%] sm:w-[46%]" />
              <col className="w-[25%] sm:w-[12%]" />
              <col className="hidden sm:table-cell sm:w-[18%]" />
            </colgroup>
            <caption className="sr-only">
              Every number is transcribed from {source}; the resolve transaction records the slash and
              the credit together.
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs font-mono uppercase tracking-wider text-slate-500">
                <th scope="col" className="pb-3 font-semibold">Field</th>
                <th scope="col" className="pb-3 font-semibold">Value</th>
                <th scope="col" className="pb-3 font-semibold">Label</th>
                <th scope="col" className="hidden pb-3 font-semibold sm:table-cell">
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <Row key={row.field} {...row} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" aria-labelledby="tx-heading" className="p-6">
        <h2 id="tx-heading" className="eyebrow text-slate-700 font-semibold">
          Every transaction on this deal
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm text-slate-600 leading-relaxed">
          {hasExplorer
            ? "Each hash opens in the configured explorer."
            : `No EVM explorer is configured for this network, so each hash opens the evidence file that records it (${source}). The hash itself is the receipt; block numbers open in the Portaldot node console.`}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm table-auto sm:table-fixed">
            <colgroup>
              <col className="sm:w-[22%]" />
              <col className="hidden sm:table-cell sm:w-[28%]" />
              <col className="sm:w-[14%]" />
              <col className="sm:w-[36%]" />
            </colgroup>
            <caption className="sr-only">The steps the deployment recorded, in the order they happened.</caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs font-mono uppercase tracking-wider text-slate-500">
                <th scope="col" className="pb-3 font-semibold">Step</th>
                <th scope="col" className="hidden pb-3 font-semibold sm:table-cell">
                  What it did
                </th>
                <th scope="col" className="pb-3 font-semibold">Block</th>
                <th scope="col" className="pb-3 font-semibold">Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipt.transactions.map((tx) => (
                <tr key={tx.id} data-testid={`receipt-tx-${tx.id}`}>
                  <td className="mono py-3 font-mono text-xs text-slate-600 break-words">{tx.id}</td>
                  <td className="hidden py-3 text-slate-900 break-words sm:table-cell">{tx.label}</td>
                  <td className="numeral py-3 font-mono">
                    <BlockLink block={tx.block} />
                  </td>
                  <td className="mono py-3 break-all font-mono text-xs">
                    {tx.hash === null ? (
                      <span className="text-slate-400">no hash recorded</span>
                    ) : (
                      <a className="link-quiet underline hover:text-amber-700 transition-colors" href={transactionHref(bundle, tx.hash)}>
                        {tx.hash}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" aria-labelledby="facts-heading" className="p-6">
        <h2 id="facts-heading" className="eyebrow text-slate-700 font-semibold">
          The deal behind it
        </h2>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div className="pt-2 sm:pt-0">
            <dt className="text-xs font-mono uppercase tracking-wider text-slate-500">Owner</dt>
            <dd className="mono break-all font-mono text-xs text-slate-900 mt-1">{receipt.owner}</dd>
          </div>
          <div className="pt-2 sm:pt-0">
            <dt className="text-xs font-mono uppercase tracking-wider text-slate-500">Provider</dt>
            <dd className="numeral font-mono text-slate-900 font-semibold mt-1">{receipt.providerId}</dd>
          </div>
          <div className="pt-2 sm:pt-0">
            <dt className="text-xs font-mono uppercase tracking-wider text-slate-500">Root</dt>
            <dd className="mono break-all font-mono text-xs text-slate-900 mt-1">{receipt.root}</dd>
          </div>
          <div className="pt-2 sm:pt-0">
            <dt className="text-xs font-mono uppercase tracking-wider text-slate-500">Size</dt>
            <dd className="numeral font-mono text-slate-900 mt-1">
              {formatCount(receipt.size)} bytes · {formatCount(receipt.leafCount)} leaves · block size{" "}
              {formatCount(receipt.blockSize)} bytes
            </dd>
          </div>
          <div className="pt-2 sm:pt-0">
            <dt className="text-xs font-mono uppercase tracking-wider text-slate-500">Blocks</dt>
            <dd className="numeral font-mono text-slate-900 mt-1">
              {formatCount(receipt.startBlock)} to {formatCount(receipt.endBlock)}
            </dd>
          </div>
          <div className="pt-2 sm:pt-0">
            <dt className="text-xs font-mono uppercase tracking-wider text-slate-500">Price and claim</dt>
            <dd className="numeral font-mono text-slate-900 mt-1">
              {formatNative(receipt.priceUnits)} tPOT price · {formatNative(receipt.claimedUnits)} tPOT
              claimed
            </dd>
          </div>
        </dl>
        <p className="mt-4 max-w-[68ch] text-xs text-slate-500 border-t border-slate-100 pt-3">
          Reported values come from {source}. The exact slash is also printed in raw units (
          {formatWei(receipt.slashUnits)} units) and the owner credit in wei (
          {formatWei(receipt.ownerCreditWei)} wei), because rounding a slash to four decimals is how a
          receipt starts lying.
        </p>
      </Card>
    </div>
  );
}
