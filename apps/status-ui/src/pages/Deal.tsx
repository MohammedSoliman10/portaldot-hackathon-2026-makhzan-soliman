import { useParams } from "react-router-dom";
import { useMode } from "../app/app-context";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, type Label } from "../data/labels";
import type { DealInfo } from "../data/schema";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";

const HEALTH_TEXT: Record<number, string> = {
  0: "settled",
  1: "active",
  2: "challenged",
  3: "expired",
};

const short = (value: string): string => `${value.slice(0, 10)}…${value.slice(-6)}`;

function Chip({ label }: { label: Label }) {
  return (
    <span className="label-chip" data-label={label}>
      {label}
    </span>
  );
}

function Field({
  name,
  value,
  unit,
  detail,
  label,
  source,
}: {
  name: string;
  value: string;
  unit?: string;
  detail?: string;
  label: Label;
  source: string;
}) {
  return (
    <div className="border-t border-rule py-2 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs text-ash">{name}</dt>
      <dd className="text-sm">
        <span className="numeral">{value}</span>
        {unit ? <span className="text-ash"> {unit}</span> : null}
        <Chip label={label} />
        {detail ? <p className="mono mt-1 break-all text-xs text-ash-2">{detail}</p> : null}
        <p className="mono mt-1 break-words text-[11px] text-ash-2">{source}</p>
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
    <article
      id={`deal-${deal.id}`}
      data-selected={selected ? "true" : undefined}
      className={`border border-rule p-4 ${selected ? "border-ochre" : ""}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base">
          Deal {deal.id}
          {selected ? <span className="ml-2 font-mono text-xs text-ochre">selected</span> : null}
        </h2>
        <p className="font-mono text-xs text-paper-dim">
          {deal.state} · {measured ? "read now" : "recorded"} · <Chip label={label} />
        </p>
      </header>

      <dl className="mt-3">
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
          value={formatCount(read?.startBlock ?? deal.startBlock)}
          label={label}
          source={source}
        />
        <Field
          name="End block"
          value={formatCount(read?.endBlock ?? deal.endBlock)}
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

      <ul className="mt-3 flex flex-wrap gap-4 text-xs">
        <li>
          <a className="link-quiet underline" href={`/evidence/${evidenceId}.json`}>
            evidence
          </a>
        </li>
        <li>
          <a className="link-quiet underline" href={`/verify/${deal.id}`}>
            verify deal {deal.id}
          </a>
        </li>
      </ul>
    </article>
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
  const live = useLiveDeployment(mode, {
    ...options,
    providerAddress: bundle?.providers[0]?.address ?? null,
    dealIds: deals.map((deal) => deal.id),
  });

  return (
    <section className="space-y-8">
      <header>
        <p className="eyebrow">02 / deals</p>
        <h1 className="mt-2 text-xl">Deals</h1>
        <p className="mt-3 max-w-[62ch] text-paper-dim">
          Two deals were created on this deployment, both against provider 1 and the same 1 MiB file.
          Each card shows the recorded facts and, when the RPC answers, the same fields read now.
        </p>
        {live.status === "live" ? (
          <p className="mt-3 font-mono text-xs text-ochre" data-testid="deal-live">
            Measured live — block {formatCount(live.block ?? 0)} · {live.at}
          </p>
        ) : null}
        {live.status === "error" ? (
          <p role="note" className="mt-3 border-l-2 border-ochre-dim py-1 pl-3 text-sm">
            {live.stale ? "STALE — " : ""}
            live read failed ({live.error ?? "unknown error"}); showing the last good value or the
            recorded evidence.
          </p>
        ) : null}
        {mode.clientEnabled ? (
          <button
            type="button"
            onClick={live.refresh}
            className="mt-3 border border-rule-strong px-3 py-1 font-mono text-xs hover:border-ochre hover:text-ochre"
          >
            Re-read
          </button>
        ) : null}
      </header>

      {deals.length === 0 ? (
        <p className="text-sm text-ash">No deal is recorded in the evidence.</p>
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

      <p className="max-w-[62ch] text-xs text-ash">
        Read-only: this page cannot create, claim or settle anything. A deal that reads settled here is
        only as good as the block and UTC time beside the value.
      </p>
    </section>
  );
}
