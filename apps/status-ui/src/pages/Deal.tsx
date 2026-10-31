import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMode } from "../app/app-context";
import { BlockLink } from "../components/BlockLink";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, type Label } from "../data/labels";
import type { DealInfo } from "../data/schema";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";
import { Card } from "../components/shared/Card";
import { Chip } from "../components/shared/Chip";

const HEALTH_TEXT: Record<number, string> = {
  0: "settled",
  1: "active",
  2: "challenged",
  3: "expired",
};

const short = (value: string): string => `${value.slice(0, 10)}…${value.slice(-6)}`;

function Field({
  name,
  value,
  unit,
  detail,
  label,
  source,
}: {
  name: string;
  value: ReactNode;
  unit?: string;
  detail?: string;
  label: Label;
  source: string;
}) {
  return (
    <div className="border-t border-slate-100 py-3 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4 sm:items-start">
      <dt className="text-xs font-mono uppercase tracking-wider text-slate-500">{name}</dt>
      <dd className="mt-1 text-sm sm:mt-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="numeral font-mono font-semibold text-slate-900">{value}</span>
          {unit ? <span className="text-xs text-slate-500"> {unit}</span> : null}
          <Chip label={label} />
        </div>
        {detail ? <p className="mono mt-1 break-all text-xs text-slate-500">{detail}</p> : null}
        <p className="mono mt-1 break-words text-[11px] text-slate-400">{source}</p>
      </dd>
    </div>
  );
}

function DealCard({
  deal,
  selected,
  live,
  chainId,
  evidenceId,
}: {
  deal: DealInfo;
  selected: boolean;
  live: ReturnType<typeof useLiveDeployment>;
  chainId: number;
  evidenceId: string;
}) {
  const read = live.deals[deal.id] ?? null;
  const health = live.health[deal.id] ?? null;
  const measured = read !== null;
  const label: Label = measured ? "MEASURED" : "REPORTED";
  const source = measured
    ? `chain ${chainId} @ block ${formatCount(live.block ?? 0)} · ${live.at}`
    : `evidence/${evidenceId}.json`;
  const healthValue = health === null ? deal.health : health;
  const healthText = healthValue === null ? "not read" : HEALTH_TEXT[healthValue];

  return (
    <Card
      as="article"
      id={`deal-${deal.id}`}
      data-selected={selected ? "true" : undefined}
      className={`transition-all ${selected ? "ring-2 ring-ochre border-ochre/80 shadow-md" : "hover:border-slate-300"}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Deal {deal.id}
            </h2>
            {selected ? (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-900 border border-amber-200">
                selected
              </span>
            ) : null}
          </div>
          <p className="font-mono text-xs text-slate-500 mt-1">
            Status: <span className="font-semibold text-slate-800">{deal.state}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400">
            {measured ? "read now" : "recorded"}
          </span>
          <Chip label={label} />
        </div>
      </header>

      <dl className="mt-4">
        <Field
          name="Health"
          value={healthValue === null ? "not read" : String(healthValue)}
          unit={healthText}
          label={label}
          source={source}
        />
        <Field
          name="Price"
          value={formatNative(read?.priceUnits ?? deal.priceUnits)}
          unit="tPOT"
          label={label}
          source={source}
        />
        <Field
          name="Start block"
          value={<BlockLink block={read?.startBlock ?? deal.startBlock} />}
          label={label}
          source={source}
        />
        <Field
          name="End block"
          value={<BlockLink block={read?.endBlock ?? deal.endBlock} />}
          label={label}
          source={source}
        />
        <Field
          name="Claimed"
          value={formatNative(read?.claimedUnits ?? deal.claimedUnits)}
          unit="tPOT"
          label={label}
          source={source}
        />
        <Field
          name="Size"
          value={formatCount(deal.size)}
          unit="bytes"
          detail={`${formatCount(deal.leafCount)} leaves · block size ${formatCount(deal.blockSize)} bytes`}
          label="REPORTED"
          source={`evidence/${evidenceId}.json`}
        />
        <Field
          name="Root"
          value={short(deal.root)}
          detail={deal.root}
          label="REPORTED"
          source={`evidence/${evidenceId}.json`}
        />
      </dl>

      <ul className="mt-6 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4 text-xs font-mono">
        <li>
          <a
            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-slate-700 hover:border-ochre hover:bg-white hover:text-slate-900 transition-all no-underline shadow-xs"
            href={`/evidence/${evidenceId}.json`}
          >
            evidence
          </a>
        </li>
        <li>
          <Link
            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-slate-700 hover:border-ochre hover:bg-white hover:text-slate-900 transition-all no-underline shadow-xs"
            to={`/verify/${deal.id}`}
          >
            verify deal {deal.id}
          </Link>
        </li>
        <li>
          <Link
            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-slate-700 hover:border-ochre hover:bg-white hover:text-slate-900 transition-all no-underline shadow-xs"
            to={`/receipt/${deal.id}`}
          >
            receipt for deal {deal.id}
          </Link>
        </li>
      </ul>
    </Card>
  );
}

function LiveDealCard({
  dealId,
  live,
  chainId,
}: {
  dealId: number;
  live: ReturnType<typeof useLiveDeployment>;
  chainId: number;
}) {
  const read = live.deals[dealId] ?? null;
  const health = live.health[dealId] ?? null;
  const healthText = health === null ? "not read" : HEALTH_TEXT[health] ?? `code ${health}`;
  const source = `chain ${chainId} @ block ${formatCount(live.block ?? 0)} · ${live.at}`;

  if (live.status === "checking" && read === null) {
    return (
      <Card as="article" id={`deal-${dealId}`} className="ring-2 ring-ochre border-ochre/80 shadow-md p-6">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Deal {dealId}</h2>
        <p className="mt-3 text-sm text-slate-500">Reading deal {dealId} from chain…</p>
      </Card>
    );
  }

  if (read === null) {
    return (
      <Card as="article" id={`deal-${dealId}`} className="ring-2 ring-ochre border-ochre/80 shadow-md p-6">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Deal {dealId}</h2>
        <p className="mt-3 text-sm text-slate-600">
          Deal {dealId} was not found on chain or could not be read.
        </p>
      </Card>
    );
  }

  return (
    <Card
      as="article"
      id={`deal-${dealId}`}
      data-selected="true"
      className="ring-2 ring-ochre border-ochre/80 shadow-md transition-all"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Deal {dealId}
            </h2>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-900 border border-amber-200">
              selected
            </span>
          </div>
          <p className="font-mono text-xs text-slate-500 mt-1">
            Status: <span className="font-semibold text-slate-800">{healthText}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400">read live</span>
          <Chip label="MEASURED" />
        </div>
      </header>

      <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 text-xs text-amber-900">
        <p className="font-medium">
          The full story and receipts exist only for recorded deals 1 and 2.
        </p>
        <p className="mt-1 text-[11px] text-amber-800/80">
          This deal was read directly from chain {chainId} at block {formatCount(live.block ?? 0)}.
        </p>
      </div>

      <dl className="mt-4">
        <Field
          name="Health"
          value={health === null ? "not read" : String(health)}
          unit={healthText}
          label="MEASURED"
          source={source}
        />
        <Field
          name="Owner"
          value={<span className="mono text-xs font-mono">{read.owner}</span>}
          label="MEASURED"
          source={source}
        />
        <Field
          name="Provider"
          value={`provider ${read.providerId}`}
          label="MEASURED"
          source={source}
        />
        <Field
          name="Flags"
          value={String(read.flags)}
          label="MEASURED"
          source={source}
        />
        <Field
          name="Price"
          value={formatNative(read.priceUnits)}
          unit="tPOT"
          label="MEASURED"
          source={source}
        />
        <Field
          name="Start block"
          value={<BlockLink block={read.startBlock} />}
          label="MEASURED"
          source={source}
        />
        <Field
          name="End block"
          value={<BlockLink block={read.endBlock} />}
          label="MEASURED"
          source={source}
        />
        <Field
          name="Claimed"
          value={formatNative(read.claimedUnits)}
          unit="tPOT"
          label="MEASURED"
          source={source}
        />
        <Field
          name="Size"
          value={formatCount(read.size)}
          unit="bytes"
          detail={`${formatCount(read.leafCount)} leaves`}
          label="MEASURED"
          source={source}
        />
        <Field
          name="Root"
          value={short(read.root)}
          detail={read.root}
          label="MEASURED"
          source={source}
        />
      </dl>

      <ul className="mt-6 flex flex-wrap gap-2.5 border-t border-slate-100 pt-4 text-xs font-mono">
        <li>
          <Link
            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-slate-700 hover:border-ochre hover:bg-white hover:text-slate-900 transition-all no-underline shadow-xs"
            to="/deal/1"
          >
            deal 1 (recorded)
          </Link>
        </li>
        <li>
          <Link
            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-slate-700 hover:border-ochre hover:bg-white hover:text-slate-900 transition-all no-underline shadow-xs"
            to="/deal/2"
          >
            deal 2 (recorded)
          </Link>
        </li>
        <li>
          <Link
            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-slate-50/80 px-4 py-2 text-slate-700 hover:border-ochre hover:bg-white hover:text-slate-900 transition-all no-underline shadow-xs"
            to="/gate"
          >
            view on gate
          </Link>
        </li>
      </ul>
    </Card>
  );
}

/** Both deals, side by side with the chain: recorded facts, then the same fields read live. */
export function Deal(options: LiveOptions) {
  const mode = useMode();
  const { id } = useParams();
  const evidence = useEvidence();
  const bundle = evidence.bundle;
  const deals = bundle?.deals ?? [];
  const selected = id === undefined ? null : Number(id);
  const isRecorded = deals.some((deal) => deal.id === selected);
  const dealIds = deals.map((deal) => deal.id);
  if (selected !== null && !isRecorded && !dealIds.includes(selected)) {
    dealIds.push(selected);
  }

  const live = useLiveDeployment(mode, {
    ...options,
    providerAddress: bundle?.providers[0]?.address ?? null,
    dealIds,
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">02 / deals</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Deals</h1>
        <p className="mt-3 max-w-[68ch] text-slate-600 leading-relaxed">
          {selected !== null && !isRecorded
            ? `Deal ${selected} was read live from the chain. Recorded facts and challenge rounds exist for deals 1 and 2.`
            : `Two deals were created on this deployment, both against provider 1 and the same 1 MiB file. Each card shows the recorded facts and, when the RPC answers, the same fields read now.`}
        </p>
        {live.status === "live" ? (
          <p className="mt-3 font-mono text-xs text-ochre font-semibold" data-testid="deal-live">
            Measured live — block {formatCount(live.block ?? 0)} · {live.at}
          </p>
        ) : null}
        {live.status === "error" ? (
          <p role="note" className="mt-3 border-l-2 border-amber-500 bg-amber-50/50 py-2 pl-3 text-sm text-amber-900 rounded-r-lg">
            {live.stale ? "STALE — " : ""}
            live read failed ({live.error ?? "unknown error"}); showing the last good value or the
            recorded evidence.
          </p>
        ) : null}
        {mode.clientEnabled ? (
          <div className="mt-4">
            <button
              type="button"
              aria-label="Re-read deal status from RPC"
              onClick={live.refresh}
              className="inline-flex min-h-[38px] items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-1.5 font-mono text-xs font-medium text-slate-800 shadow-xs hover:border-ochre hover:text-ochre transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-ochre"
            >
              Re-read
            </button>
          </div>
        ) : null}
      </header>

      {selected !== null && !isRecorded ? (
        <div className="space-y-8">
          <LiveDealCard
            dealId={selected}
            live={live}
            chainId={bundle?.chain.chainId ?? mode.expectedChainId}
          />
          <section className="space-y-4 pt-4 border-t border-slate-200">
            <h2 className="eyebrow text-slate-600 font-semibold">Recorded evidence deals</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {deals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  selected={false}
                  live={live}
                  chainId={bundle?.chain.chainId ?? mode.expectedChainId}
                  evidenceId={bundle?.id ?? "portaldot-live-run2"}
                />
              ))}
            </div>
          </section>
        </div>
      ) : deals.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">No deal is recorded in the evidence.</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              selected={selected === deal.id}
              live={live}
              chainId={bundle?.chain.chainId ?? mode.expectedChainId}
              evidenceId={bundle?.id ?? "portaldot-live-run2"}
            />
          ))}
        </div>
      )}

      <p className="max-w-[68ch] text-xs text-slate-500 leading-relaxed">
        Read-only: this page cannot create, claim or settle anything. A deal that reads settled here is
        only as good as the block and UTC time beside the value.
      </p>
    </div>
  );
}
