import { useState } from "react";
import { useParams } from "react-router-dom";
import { BlockLink } from "../components/BlockLink";
import { CopyText } from "../components/CopyText";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, formatWei, type Label } from "../data/labels";
import { receiptFor, receiptLink, receiptRows, transactionHref, type ReceiptRow } from "../data/receipt";
import { downloadReceiptPng } from "../data/receipt-image";

const slug = (field: string): string =>
  field
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function Chip({ label }: { label: Label }) {
  return (
    <span className="label-chip" data-label={label}>
      {label}
    </span>
  );
}

function Row({ field, value, unit, detail, label, source }: ReceiptRow) {
  return (
    <tr data-testid={`receipt-row-${slug(field)}`}>
      <td className="break-words text-ash">
        {field}
        <p className="mono mt-1 break-all text-[10px] text-ash-2 sm:hidden">{source}</p>
      </td>
      <td className="numeral">
        {value}
        {unit ? <span className="text-ash"> {unit}</span> : null}
        {detail ? <p className="mono mt-1 break-words text-xs text-ash-2">{detail}</p> : null}
      </td>
      <td>
        <Chip label={label} />
      </td>
      <td className="mono hidden break-words text-xs text-ash-2 sm:table-cell">{source}</td>
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
      <section className="space-y-4">
        <p className="eyebrow">07 / receipt</p>
        <h1 className="mt-2 text-xl">
          {bundle === null ? "The evidence has not loaded" : `No receipt for deal ${id}`}
        </h1>
        <p className="mt-3 max-w-[62ch] text-paper-dim">
          {bundle === null
            ? "There is no evidence bundle on this page yet, so there is nothing to print. Reload when the evidence file is reachable; no number here is invented."
            : `The recorded evidence holds deals ${held}. A receipt exists only for a deal that was actually created on this deployment.`}
        </p>
        <p className="text-sm">
          <a className="link-quiet underline" href="/#/receipt/1">
            deal 1
          </a>{" "}
          ·{" "}
          <a className="link-quiet underline" href="/#/receipt/2">
            deal 2
          </a>
        </p>
      </section>
    );
  }

  const link = receiptLink(window.location.origin, receipt.dealId);
  const rows = receiptRows(receipt);
  const source = `evidence/${receipt.evidenceId}.json`;
  const hasExplorer = bundle.chain.explorer !== null && bundle.chain.explorer.trim() !== "";

  return (
    <section className="space-y-10">
      <header>
        <p className="eyebrow">07 / receipt</p>
        <h1 className="mt-2 text-xl">Receipt — deal {receipt.dealId}</h1>
        <p className="mt-3 max-w-[62ch] text-paper-dim">
          {receipt.slashUnits === "0"
            ? `Deal ${receipt.dealId} is ${receipt.state}, and no slash was recorded on it: every challenge was answered before its deadline, so the bond came back whole.`
            : `Deal ${receipt.dealId} is ${receipt.state}, and one challenge was left unanswered. The bond went from ${formatNative(receipt.bondBeforeUnits)} tPOT to ${formatNative(receipt.bondAfterUnits)} tPOT, and the owner was credited the cut.`}{" "}
          This page is a record of what the chain did, not a live read: the bond now lives on{" "}
          <a className="link-quiet underline" href="/proof">
            the proof page
          </a>
          .
        </p>
      </header>

      <section aria-labelledby="share-heading">
        <h2 id="share-heading" className="eyebrow">
          Send it, or save it
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <CopyText text={link} />
          <button
            type="button"
            onClick={() => setImage(downloadReceiptPng(receipt))}
            className="border border-rule-strong px-3 py-1 font-mono text-xs hover:border-ochre hover:text-ochre"
          >
            Download image
          </button>
          {image === "downloaded" ? (
            <span className="text-xs text-ash">Image ready — check your downloads.</span>
          ) : null}
          {image === "unsupported" ? (
            <span className="text-xs text-ash">
              This browser cannot draw the image; everything above is still readable and copyable.
            </span>
          ) : null}
        </div>
        <p className="mono mt-2 break-all text-[11px] text-ash-2">{link}</p>
        <p className="mt-2 max-w-[62ch] text-xs text-ash">
          The link uses a hash route, so it opens on any static host without a server rewrite.
        </p>
      </section>

      <section aria-labelledby="numbers-heading">
        <h2 id="numbers-heading" className="eyebrow">
          Bond, slash, credit
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full table-auto sm:table-fixed">
            <colgroup>
              <col className="sm:w-[26%]" />
              <col className="sm:w-[30%]" />
              <col className="sm:w-[18%]" />
              <col className="sm:w-[26%]" />
            </colgroup>
            <caption>
              Every number is transcribed from {source}; the resolve transaction records the slash and
              the credit together.
            </caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Value</th>
                <th scope="col">Label</th>
                <th scope="col" className="hidden sm:table-cell">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.field} {...row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="tx-heading">
        <h2 id="tx-heading" className="eyebrow">
          Every transaction on this deal
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-paper-dim">
          {hasExplorer
            ? "Each hash opens in the configured explorer."
            : `No EVM explorer is configured for this network, so each hash opens the evidence file that records it (${source}). The hash itself is the receipt; block numbers open in the Portaldot node console.`}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full table-auto sm:table-fixed">
            <colgroup>
              <col className="sm:w-[22%]" />
              <col className="hidden sm:table-cell sm:w-[28%]" />
              <col className="sm:w-[14%]" />
              <col className="sm:w-[36%]" />
            </colgroup>
            <caption>The steps the deployment recorded, in the order they happened.</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col" className="hidden sm:table-cell">
                  What it did
                </th>
                <th scope="col">Block</th>
                <th scope="col">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {receipt.transactions.map((tx) => (
                <tr key={tx.id} data-testid={`receipt-tx-${tx.id}`}>
                  <td className="mono break-words text-xs text-ash">{tx.id}</td>
                  <td className="hidden break-words sm:table-cell">{tx.label}</td>
                  <td className="numeral">
                    <BlockLink block={tx.block} />
                  </td>
                  <td className="mono break-all text-xs">
                    {tx.hash === null ? (
                      <span className="text-ash">no hash recorded</span>
                    ) : (
                      <a className="link-quiet underline" href={transactionHref(bundle, tx.hash)}>
                        {tx.hash}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="facts-heading">
        <h2 id="facts-heading" className="eyebrow">
          The deal behind it
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ash">Owner</dt>
            <dd className="mono break-all text-xs">{receipt.owner}</dd>
          </div>
          <div>
            <dt className="text-ash">Provider</dt>
            <dd className="numeral">{receipt.providerId}</dd>
          </div>
          <div>
            <dt className="text-ash">Root</dt>
            <dd className="mono break-all text-xs">{receipt.root}</dd>
          </div>
          <div>
            <dt className="text-ash">Size</dt>
            <dd className="numeral">
              {formatCount(receipt.size)} bytes · {formatCount(receipt.leafCount)} leaves · block size{" "}
              {formatCount(receipt.blockSize)} bytes
            </dd>
          </div>
          <div>
            <dt className="text-ash">Blocks</dt>
            <dd className="numeral">
              {formatCount(receipt.startBlock)} to {formatCount(receipt.endBlock)}
            </dd>
          </div>
          <div>
            <dt className="text-ash">Price and claim</dt>
            <dd className="numeral">
              {formatNative(receipt.priceUnits)} tPOT price · {formatNative(receipt.claimedUnits)} tPOT
              claimed
            </dd>
          </div>
        </dl>
        <p className="mt-3 max-w-[62ch] text-xs text-ash">
          Reported values come from {source}. The exact slash is also printed in raw units (
          {formatWei(receipt.slashUnits)} units) and the owner credit in wei (
          {formatWei(receipt.ownerCreditWei)} wei), because rounding a slash to four decimals is how a
          receipt starts lying.
        </p>
      </section>
    </section>
  );
}
