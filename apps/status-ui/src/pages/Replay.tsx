import { useState } from "react";
import { BlockLink } from "../components/BlockLink";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, type Label } from "../data/labels";
import { replayFor, type ReplayStep } from "../data/replay";

function Chip({ label }: { label: Label }) {
  return (
    <span className="label-chip" data-label={label}>
      {label}
    </span>
  );
}

function Step({
  step,
  bundleHref,
  position,
  total,
}: {
  step: ReplayStep;
  bundleHref: string;
  position: number;
  total: number;
}) {
  return (
    <article data-testid="replay-step" aria-live="polite" className="border-t border-rule pt-4">
      <p className="eyebrow">
        step {formatCount(position)} of {formatCount(total)}
      </p>
      <h2 data-testid="replay-step-title" className="mt-1 text-lg">
        {step.title}
      </h2>
      <p className="mt-2 max-w-[62ch] text-sm text-paper-dim">{step.what}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ash">Block</dt>
          <dd className="numeral">
            <BlockLink block={step.block} />
          </dd>
        </div>
        <div>
          <dt className="text-ash">Transaction</dt>
          <dd className="mono break-all text-xs">
            {step.tx === null ? (
              <span className="text-ash">no transaction — nothing was sent</span>
            ) : (
              <a className="link-quiet underline" href={bundleHref}>
                {step.tx}
              </a>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-ash">Label</dt>
          <dd>
            <Chip label={step.label} />
          </dd>
        </div>
        <div>
          <dt className="text-ash">Source</dt>
          <dd className="mono break-all text-xs text-ash-2">{step.source}</dd>
        </div>
      </dl>
    </article>
  );
}

/**
 * The recorded run as a sequence you can walk through. Every number is REPORTED from the evidence
 * bundle; the live reads live on `/verify` and `/proof`, and the page says so.
 */
export function Replay() {
  const evidence = useEvidence();
  const bundle = evidence.bundle;
  const [dealId, setDealId] = useState(2);
  const [index, setIndex] = useState(0);
  const replay = replayFor(bundle, dealId);

  if (bundle === null || replay === null) {
    return (
      <section className="space-y-4">
        <p className="eyebrow">06 / replay</p>
        <h1 className="mt-2 text-xl">The recorded run, step by step</h1>
        <p className="mt-3 max-w-[62ch] text-paper-dim">
          {bundle === null
            ? "The evidence bundle has not loaded, so there is nothing to replay. Nothing is invented here."
            : `The evidence holds deals ${bundle.deals.map((deal) => deal.id).join(", ")}, so there is no run to replay for deal ${dealId}.`}
        </p>
        <p className="text-sm">
          <a className="link-quiet underline" href="/replay">
            deal 2
          </a>{" "}
          ·{" "}
          <a className="link-quiet underline" href="/deal/2">
            the deal page
          </a>
        </p>
      </section>
    );
  }

  const total = replay.steps.length;
  const step = replay.steps[Math.min(index, total - 1)]!;
  const bundleHref = `/evidence/${replay.evidenceId}.json`;
  const choose = (next: number): void => {
    setDealId(next);
    setIndex(0);
  };

  return (
    <section className="space-y-8">
      <header>
        <p className="eyebrow">06 / replay</p>
        <h1 className="mt-2 text-xl">The recorded run, step by step</h1>
        <p className="mt-3 max-w-[62ch] text-paper-dim">
          This is a recording, not a live read: every step comes from{" "}
          <a className="link-quiet underline" href={bundleHref}>
            {step.source}
          </a>{" "}
          and carries the REPORTED label. To see the chain now,{" "}
          <a className="link-quiet underline" href="/verify">
            check a file on Verify
          </a>{" "}
          or{" "}
          <a className="link-quiet underline" href="/proof">
            read the bond on Proof
          </a>
          .
        </p>
      </header>

      <section aria-labelledby="choose-heading">
        <h2 id="choose-heading" className="eyebrow">
          Which run
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2].map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={dealId === id}
              aria-label={`Select deal ${id} run`}
              onClick={() => choose(id)}
              className={`border px-3 py-1 font-mono text-xs ${
                dealId === id
                  ? "border-ochre text-ochre"
                  : "border-rule-strong hover:border-ochre hover:text-ochre"
              }`}
            >
              Deal {id}
              {id === 2 ? " — one slash" : " — answered in time"}
            </button>
          ))}
        </div>
        {replay.slashed && replay.bondBeforeUnits !== null && replay.bondAfterUnits !== null ? (
          <p className="mt-3 max-w-[62ch] text-sm text-paper-dim">
            Deal {replay.dealId} ends with the bond at {formatNative(replay.bondAfterUnits)} tPOT, down
            from {formatNative(replay.bondBeforeUnits)} tPOT, and the owner credited exactly{" "}
            {formatNative(replay.slashUnits ?? "0")} tPOT.
          </p>
        ) : (
          <p className="mt-3 max-w-[62ch] text-sm text-paper-dim">
            Deal {replay.dealId} was answered in time: the bond is unchanged and no slash exists on it.
          </p>
        )}
      </section>

      <section aria-labelledby="step-heading">
        <h2 id="step-heading" className="eyebrow">
          Walk the run
        </h2>
        <div
          data-testid="replay-progress"
          role="progressbar"
          aria-label="Replay progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-valuetext={`step ${index + 1} of ${total}: ${step.title}`}
          className="mt-2 h-1 w-full bg-rule"
        >
          <div
            className="h-full bg-ochre transition-[width] duration-200"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <div className="mt-4">
          <Step step={step} bundleHref={bundleHref} position={index + 1} total={total} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-label="Previous step"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={index === 0}
            className="border border-rule-strong px-3 py-1 font-mono text-xs hover:border-ochre hover:text-ochre disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            aria-label="Next step"
            onClick={() => setIndex((current) => Math.min(total - 1, current + 1))}
            disabled={index === total - 1}
            className="border border-rule-strong px-3 py-1 font-mono text-xs hover:border-ochre hover:text-ochre disabled:opacity-50"
          >
            Next
          </button>
          <span className="text-xs text-ash">
            Step {formatCount(index + 1)} of {formatCount(total)}
          </span>
        </div>
      </section>

      <section aria-labelledby="all-steps-heading">
        <h2 id="all-steps-heading" className="eyebrow">
          All steps
        </h2>
        <ol data-testid="replay-steps" className="mt-2 space-y-1 text-sm">
          {replay.steps.map((item, position) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-current={position === index ? "step" : undefined}
                aria-label={`Go to step ${position + 1}: ${item.title}`}
                className={`w-full break-words border-l-2 px-3 py-1 text-left ${
                  position === index
                    ? "border-ochre text-paper"
                    : "border-rule text-ash hover:border-ochre hover:text-paper"
                }`}
              >
                <span className="numeral mr-2 text-ash-2">{position + 1}.</span>
                {item.title}
                <span className="mono ml-2 text-[11px] text-ash-2">
                  block {formatCount(item.block)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="eyebrow">
          What this replay is not
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-paper-dim">
          It does not re-execute anything and it does not prove the provider was offline: it replays
          what the evidence recorded. The one live check that matters is on{" "}
          <a className="link-quiet underline" href="/verify">
            Verify
          </a>
          , where the file is hashed in this browser and compared with the root read from the chain now.
        </p>
      </section>
    </section>
  );
}
