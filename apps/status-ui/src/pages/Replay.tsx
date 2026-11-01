import { useState } from "react";
import { BlockLink } from "../components/BlockLink";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative } from "../data/labels";
import { replayFor, type ReplayStep } from "../data/replay";
import { Card } from "../components/shared/Card";
import { Chip } from "../components/shared/Chip";

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
    <article data-testid="replay-step" aria-live="polite" className="border-t border-line pt-4">
      <p className="eyebrow text-muted">
        step {formatCount(position)} of {formatCount(total)}
      </p>
      <h2 data-testid="replay-step-title" className="mt-1 text-lg font-bold text-gold-bright">
        {step.title}
      </h2>
      <p className="mt-2 max-w-[68ch] text-sm text-muted leading-relaxed">{step.what}</p>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 rounded-xl border border-line bg-surface-2 p-4">
        <div>
          <dt className="text-xs font-mono uppercase text-muted">Block</dt>
          <dd className="numeral font-mono font-semibold text-ink mt-0.5">
            <BlockLink block={step.block} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-mono uppercase text-muted">Transaction</dt>
          <dd className="mono break-all text-xs font-medium text-ink mt-0.5">
            {step.tx === null ? (
              <span className="text-muted">no transaction — nothing was sent</span>
            ) : (
              <a className="link-quiet underline hover:text-ink" href={bundleHref}>
                {step.tx}
              </a>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-mono uppercase text-muted">Label</dt>
          <dd className="mt-0.5">
            <Chip label={step.label} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-mono uppercase text-muted">Source</dt>
          <dd className="mono break-all text-xs text-muted mt-0.5">{step.source}</dd>
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
      <div className="space-y-6">
        <header>
          <p className="eyebrow">06 / replay</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-gold-bright">The recorded run, step by step</h1>
          <p className="mt-3 max-w-[68ch] text-muted leading-relaxed">
            {bundle === null
              ? "The evidence bundle has not loaded, so there is nothing to replay. Nothing is invented here."
              : `The evidence holds deals ${bundle.deals.map((deal) => deal.id).join(", ")}, so there is no run to replay for deal ${dealId}.`}
          </p>
        </header>
        <Card>
          <p className="text-sm">
            <a className="link-quiet underline font-medium" href="/replay">
              deal 2
            </a>{" "}
            ·{" "}
            <a className="link-quiet underline font-medium" href="/deal/2">
              the deal page
            </a>
          </p>
        </Card>
      </div>
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
    <div className="space-y-12">
      <header>
        <p className="eyebrow">06 / replay</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-gold-bright">The recorded run, step by step</h1>
        <p className="mt-3 max-w-[68ch] text-muted leading-relaxed">
          This is a recording, not a live read: every step comes from{" "}
          <a className="link-quiet underline font-medium" href={bundleHref}>
            {step.source}
          </a>{" "}
          and carries the REPORTED label. To see the chain now,{" "}
          <a className="link-quiet underline font-medium" href="/verify">
            check a file on Verify
          </a>{" "}
          or{" "}
          <a className="link-quiet underline font-medium" href="/proof">
            read the bond on Proof
          </a>
          .
        </p>
      </header>

      {/* Which run Card */}
      <Card as="section" aria-labelledby="choose-heading">
        <h2 id="choose-heading" className="eyebrow text-gold-bright font-semibold">
          Which run
        </h2>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {[1, 2].map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={dealId === id}
              aria-label={`Select deal ${id} run`}
              onClick={() => choose(id)}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-5 py-2 font-mono text-xs font-semibold transition-all cursor-pointer shadow-xs focus-visible:outline-2 focus-visible:outline-gold-bright ${
                dealId === id
                  ? "bg-gold text-on-gold border border-gold"
                  : "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2"
              }`}
            >
              Deal {id}
              {id === 2 ? " — one slash" : " — answered in time"}
            </button>
          ))}
        </div>
        {replay.slashed && replay.bondBeforeUnits !== null && replay.bondAfterUnits !== null ? (
          <p className="mt-4 max-w-[68ch] text-sm text-muted leading-relaxed border-t border-line pt-3">
            Deal {replay.dealId} ends with the bond at {formatNative(replay.bondAfterUnits)} tPOT, down
            from {formatNative(replay.bondBeforeUnits)} tPOT, and the owner credited exactly{" "}
            {formatNative(replay.slashUnits ?? "0")} tPOT.
          </p>
        ) : (
          <p className="mt-4 max-w-[68ch] text-sm text-muted leading-relaxed border-t border-line pt-3">
            Deal {replay.dealId} was answered in time: the bond is unchanged and no slash exists on it.
          </p>
        )}
      </Card>

      {/* Walk the run Card */}
      <Card as="section" aria-labelledby="step-heading">
        <h2 id="step-heading" className="eyebrow text-gold-bright font-semibold">
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
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full bg-gold transition-[width] duration-200"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <div className="mt-5">
          <Step step={step} bundleHref={bundleHref} position={index + 1} total={total} />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            type="button"
            aria-label="Previous step"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={index === 0}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-line-strong bg-surface px-5 py-2 font-mono text-xs font-semibold text-ink shadow-xs hover:border-gold-bright hover:text-ink transition-all disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-gold-bright"
          >
            Previous
          </button>
          <button
            type="button"
            aria-label="Next step"
            onClick={() => setIndex((current) => Math.min(total - 1, current + 1))}
            disabled={index === total - 1}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gold px-5 py-2 font-mono text-xs font-semibold text-on-gold shadow-xs hover:bg-gold-bright transition-all disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-gold-bright"
          >
            Next
          </button>
          <span className="font-mono text-xs text-muted font-medium">
            Step {formatCount(index + 1)} of {formatCount(total)}
          </span>
        </div>
      </Card>

      {/* All steps Card */}
      <Card as="section" aria-labelledby="all-steps-heading">
        <h2 id="all-steps-heading" className="eyebrow text-gold-bright font-semibold">
          All steps
        </h2>
        <ol data-testid="replay-steps" className="mt-3 space-y-1.5 text-sm">
          {replay.steps.map((item, position) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-current={position === index ? "step" : undefined}
                aria-label={`Go to step ${position + 1}: ${item.title}`}
                className={`w-full break-words rounded-xl px-4 py-2.5 text-left transition-all cursor-pointer text-[15px] ${
                  position === index
                    ? "bg-gold text-on-gold font-semibold"
                    : "text-ink hover:bg-surface-2 hover:text-ink font-medium"
                }`}
              >
                <span className={`mr-2.5 font-mono font-bold ${position === index ? "text-on-gold" : "text-muted font-semibold"}`}>
                  {position + 1}.
                </span>
                <span>{item.title}</span>
                <span className={`ml-3 font-mono text-[14px] ${position === index ? "text-on-gold/80" : "text-muted font-medium"}`}>
                  block {formatCount(item.block)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Card>

      {/* What this replay is not Card */}
      <Card as="section" aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="eyebrow text-gold-bright font-semibold">
          What this replay is not
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm text-muted leading-relaxed">
          It does not re-execute anything and it does not prove the provider was offline: it replays
          what the evidence recorded. The one live check that matters is on{" "}
          <a className="link-quiet underline font-medium hover:text-ink" href="/verify">
            Verify
          </a>
          , where the file is hashed in this browser and compared with the root read from the chain now.
        </p>
      </Card>
    </div>
  );
}
