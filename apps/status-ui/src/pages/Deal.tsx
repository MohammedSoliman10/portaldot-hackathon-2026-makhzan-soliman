import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMode } from "../app/app-context";
import { BlockLink } from "../components/BlockLink";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, type Label } from "../data/labels";
import type { DealInfo } from "../data/schema";
import type { DealRead } from "../data/reads";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";
import { Card } from "../components/shared/Card";
import { Chip } from "../components/shared/Chip";
import { HEALTH_TEXT, healthLabel } from "../data/health";

export { HEALTH_TEXT };

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
    <div className="border-t border-line py-3 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4 sm:items-start">
      <dt className="text-xs font-mono uppercase tracking-wider text-muted">{name}</dt>
      <dd className="mt-1 text-sm sm:mt-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="numeral font-mono font-semibold text-ink">{value}</span>
          {unit ? <span className="text-xs text-muted"> {unit}</span> : null}
          <Chip label={label} />
        </div>
        {detail ? <p className="mono mt-1 break-all text-xs text-muted">{detail}</p> : null}
        <p className="mt-1 break-words text-[15px] text-muted">{source}</p>
      </dd>
    </div>
  );
}

function DealCard({
  dealId,
  recorded,
  selected,
  live,
  chainId,
  evidenceId,
}: {
  dealId: number;
  recorded: DealInfo | null;
  selected: boolean;
  live: ReturnType<typeof useLiveDeployment>;
  chainId: number;
  evidenceId: string;
}) {
  const read = live.deals[dealId] ?? null;
  const health = live.health[dealId] ?? null;
  const measured = read !== null;
  const label: Label = measured ? "MEASURED" : "REPORTED";
  const source = measured
    ? `chain ${chainId} @ block ${formatCount(live.block ?? 0)} · ${live.at}`
    : `evidence/${evidenceId}.json`;

  const healthValue = health !== null ? health : (recorded?.health ?? null);
  const healthText = healthValue === null ? "not read" : healthLabel(healthValue);

  const statusText = measured ? healthText : (recorded?.state ?? healthText);

  if (live.status === "checking" && read === null && !recorded) {
    return (
      <Card as="article" id={`deal-${dealId}`} className="p-6">
        <h2 className="text-xl font-bold tracking-tight text-gold-bright">Deal {dealId}</h2>
        <p className="mt-3 text-sm text-muted">Reading deal {dealId} from chain…</p>
      </Card>
    );
  }

  const priceUnits = read?.priceUnits ?? recorded?.priceUnits ?? "0";
  const startBlock = read?.startBlock ?? recorded?.startBlock ?? 0;
  const endBlock = read?.endBlock ?? recorded?.endBlock ?? 0;
  const claimedUnits = read?.claimedUnits ?? recorded?.claimedUnits ?? "0";
  const size = read?.size ?? recorded?.size ?? 0;
  const leafCount = read?.leafCount ?? recorded?.leafCount ?? 0;
  const root = read?.root ?? recorded?.root ?? "0x";
  const owner = read?.owner ?? recorded?.owner ?? null;
  const providerId = read?.providerId ?? recorded?.providerId ?? null;
  const flags = read?.flags ?? recorded?.flags ?? null;

  return (
    <Card
      as="article"
      id={`deal-${dealId}`}
      data-selected={selected ? "true" : undefined}
      className={`transition-all ${selected ? "ring-2 ring-gold border-gold/80 shadow-md" : "hover:border-line-strong"}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-gold-bright">
              Deal {dealId}
            </h2>
            {selected ? (
              <span className="label-chip inline-flex items-center rounded-full bg-warn-surface px-2.5 py-0.5 font-mono text-[13px] font-semibold text-gold-bright border border-warn">
                selected
              </span>
            ) : null}
          </div>
          <p className="text-[15px] text-muted mt-1">
            Status: <span className="font-semibold text-ink">{statusText}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[15px] text-muted">
            {measured ? "read live" : "recorded"}
          </span>
          <Chip label={label} />
        </div>
      </header>

      {!recorded ? (
        <div className="mt-4 rounded-xl border border-warn bg-warn-surface p-3.5 text-xs text-gold-bright">
          <p className="font-medium">
            The full story and receipts exist only for recorded deals 1 and 2.
          </p>
          <p className="mt-1 text-[15px] text-gold-bright">
            This deal was read directly from chain {chainId} at block {formatCount(live.block ?? 0)}.
          </p>
        </div>
      ) : null}

      <dl className="mt-4">
        <Field
          name="Health"
          value={healthText}
          unit={healthValue !== null ? `(code ${healthValue})` : undefined}
          label={label}
          source={source}
        />
        {owner ? (
          <Field
            name="Owner"
            value={<span className="mono text-xs font-mono break-all">{short(owner)}</span>}
            detail={owner}
            label={label}
            source={source}
          />
        ) : null}
        {providerId !== null ? (
          <Field
            name="Provider"
            value={`provider ${providerId}`}
            label={label}
            source={source}
          />
        ) : null}
        {flags !== null ? (
          <Field
            name="Flags"
            value={String(flags)}
            label={label}
            source={source}
          />
        ) : null}
        <Field
          name="Price"
          value={formatNative(priceUnits)}
          unit="tPOT"
          label={label}
          source={source}
        />
        <Field
          name="Start block"
          value={<BlockLink block={startBlock} />}
          label={label}
          source={source}
        />
        <Field
          name="End block"
          value={<BlockLink block={endBlock} />}
          label={label}
          source={source}
        />
        <Field
          name="Claimed"
          value={formatNative(claimedUnits)}
          unit="tPOT"
          label={label}
          source={source}
        />
        <Field
          name="Size"
          value={formatCount(size)}
          unit="bytes"
          detail={`${formatCount(leafCount)} leaves${recorded?.blockSize ? ` · block size ${formatCount(recorded.blockSize)} bytes` : ""}`}
          label={measured ? "MEASURED" : "REPORTED"}
          source={source}
        />
        <Field
          name="Root"
          value={short(root)}
          detail={root}
          label={measured ? "MEASURED" : "REPORTED"}
          source={source}
        />
      </dl>

      <ul className="mt-6 flex flex-wrap gap-2.5 border-t border-line pt-4 text-xs font-mono">
        {recorded ? (
          <li>
            <a
              className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface-2 px-4 py-2 text-ink hover:border-gold-bright hover:bg-surface hover:text-ink transition-all no-underline shadow-xs"
              href={`/evidence/${evidenceId}.json`}
            >
              evidence
            </a>
          </li>
        ) : null}
        <li>
          <Link
            className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface-2 px-4 py-2 text-ink hover:border-gold-bright hover:bg-surface hover:text-ink transition-all no-underline shadow-xs"
            to={`/verify/${dealId}`}
          >
            verify deal {dealId}
          </Link>
        </li>
        {recorded ? (
          <li>
            <Link
              className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface-2 px-4 py-2 text-ink hover:border-gold-bright hover:bg-surface hover:text-ink transition-all no-underline shadow-xs"
              to={`/receipt/${dealId}`}
            >
              receipt for deal {dealId}
            </Link>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

function buildIntroSentence({
  totalDeals,
  dealsList,
  isLive,
  error,
}: {
  totalDeals: number;
  dealsList: (DealRead | null)[];
  isLive: boolean;
  error?: string | null;
}): string {
  if (!isLive) {
    if (error) return "Failed to read deals from the chain.";
    return `${formatCount(totalDeals)} ${totalDeals === 1 ? "deal" : "deals"} recorded in evidence.`;
  }

  const validDeals = dealsList.filter((d): d is DealRead => d !== null);
  const allDealsRead = validDeals.length === totalDeals && totalDeals > 0;

  const allSameProvider =
    allDealsRead && validDeals.every((d) => d.providerId === validDeals[0]!.providerId);
  const providerId = allSameProvider ? validDeals[0]!.providerId : null;

  const allSameFile =
    allDealsRead &&
    validDeals.every((d) => d.root === validDeals[0]!.root && d.size === validDeals[0]!.size);
  const fileSize = allSameFile ? validDeals[0]!.size : null;
  const fileSizeStr = fileSize === 1048576 ? "1 MiB" : fileSize !== null ? `${formatCount(fileSize)} byte` : "";

  let claim = `${formatCount(totalDeals)} ${totalDeals === 1 ? "deal" : "deals"}, read live from the chain`;

  if (allSameProvider && allSameFile) {
    claim += `, all against provider ${providerId} and the same ${fileSizeStr} file.`;
  } else if (allSameProvider) {
    claim += `, all against provider ${providerId}.`;
  } else if (allSameFile) {
    claim += `, all for the same ${fileSizeStr} file.`;
  } else {
    claim += ".";
  }

  return claim;
}

/** Shows one card per deal for 1..nextDealId read live from the chain. */
export function Deal(options: LiveOptions) {
  const mode = useMode();
  const { id } = useParams();
  const evidence = useEvidence();
  const bundle = evidence.bundle;
  const recordedDeals = bundle?.deals ?? [];
  const selected = id === undefined ? null : Number(id);

  const requestDealIds = [
    ...new Set([
      ...(options.dealIds ?? []),
      ...(selected !== null && selected > 0 ? [selected] : []),
    ]),
  ];

  const live = useLiveDeployment(mode, {
    ...options,
    allDeals: options.allDeals ?? true,
    dealIds: requestDealIds,
    providerAddress: bundle?.providers[0]?.address ?? null,
  });

  const isLive = live.status === "live";
  const isError = live.status === "error";
  const isChecking = live.status === "checking";

  const totalDeals = isLive && live.config
    ? Math.max(0, live.config.nextDealId)
    : recordedDeals.length;

  let dealIds = isLive
    ? Array.from({ length: totalDeals }, (_, i) => i + 1)
    : recordedDeals.map((d) => d.id);

  if (selected !== null && selected > 0 && !dealIds.includes(selected)) {
    dealIds = [...dealIds, selected];
  }

  const dealsList = dealIds.map((dealId) => live.deals[dealId] ?? null);

  const intro = buildIntroSentence({
    totalDeals,
    dealsList,
    isLive,
    error: isError ? live.error : null,
  });

  return (
    <div className="space-y-12">
      <header>
        <p className="eyebrow">02 / deals</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-gold-bright">Deals</h1>
        <p className="mt-3 max-w-[68ch] text-muted leading-relaxed">
          {intro}
        </p>
        {isLive ? (
          <p data-testid="deal-live" className="mt-3 text-[15px] text-gold-bright font-semibold">
            Measured live — block {formatCount(live.block ?? 0)} · {live.at}
          </p>
        ) : null}
        {mode.clientEnabled ? (
          <div className="mt-4">
            <button
              type="button"
              aria-label="Re-read deal status from RPC"
              onClick={live.refresh}
              className="inline-flex min-h-[38px] items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-1.5 font-mono text-xs font-medium text-ink shadow-xs hover:border-gold-bright hover:text-gold-bright transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-gold-bright"
            >
              Re-read
            </button>
          </div>
        ) : null}
      </header>

      {isError ? (
        <Card as="section" role="alert" className="border-danger/80 bg-danger-surface p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-danger">RPC Read Failed</h2>
          </div>
          <p className="mt-3 text-sm text-ink leading-relaxed">
            Failed to read live deals from the chain: {live.error ?? "unknown error"}.
          </p>
          <p className="mt-2 text-xs text-muted">
            Stale deal numbers are hidden to prevent showing inaccurate chain state.
          </p>
          {mode.clientEnabled ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={live.refresh}
                className="inline-flex min-h-[38px] items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-1.5 font-mono text-xs font-medium text-ink shadow-xs hover:border-gold-bright hover:text-gold-bright transition-all cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : null}
        </Card>
      ) : isChecking && dealIds.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Reading deals live from the chain…</p>
        </Card>
      ) : dealIds.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No deal is recorded in the evidence.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {dealIds.map((dealId) => {
            const recorded = recordedDeals.find((d) => d.id === dealId) ?? null;
            return (
              <DealCard
                key={dealId}
                dealId={dealId}
                recorded={recorded}
                selected={selected === dealId}
                live={live}
                chainId={bundle?.chain.chainId ?? mode.expectedChainId}
                evidenceId={bundle?.id ?? "portaldot-live-run2"}
              />
            );
          })}
        </div>
      )}

      <p className="max-w-[68ch] text-xs text-muted leading-relaxed">
        Read-only: this page cannot create, claim or settle anything. A deal that reads settled here is
        only as good as the block and UTC time beside the value.
      </p>
    </div>
  );
}
