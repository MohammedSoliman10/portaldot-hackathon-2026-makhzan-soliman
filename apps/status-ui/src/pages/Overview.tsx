import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMode } from "../app/app-context";
import { BlockLink } from "../components/BlockLink";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, formatWeiAsNative, type Label } from "../data/labels";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";
import { useLiveDeals } from "../data/use-live-deals";
import type { EvidenceBundle, Hex, RoundInfo } from "../data/schema";
import { Card } from "../components/shared/Card";
import { Button } from "../components/shared/Button";
import { Chip } from "../components/shared/Chip";
import { Hero } from "../components/shared/Hero";
import { Stat } from "../components/shared/Stat";

const REPO = "https://github.com/MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman";

const hostOf = (rpcUrl: string | null): string => {
  if (!rpcUrl) return "no RPC";
  try {
    return new URL(rpcUrl).host;
  } catch {
    return rpcUrl;
  }
};

const HEALTH_TEXT: Record<number, string> = {
  0: "settled",
  1: "active",
  2: "challenged",
  3: "expired",
};

function Row({
  field,
  value,
  unit,
  detail,
  label,
  source,
}: {
  field: string;
  value: ReactNode;
  unit?: string;
  detail?: string;
  label: Label;
  source: string;
}) {
  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td className="break-words font-medium text-slate-700 py-3">{field}</td>
      <td className="numeral font-mono text-slate-900 py-3">
        {value}
        {unit ? (
          <>
            {" "}
            <span className="text-slate-500 font-sans text-xs">{unit}</span>
          </>
        ) : null}
        {detail ? <p className="mono mt-1 break-words text-xs text-slate-500">{detail}</p> : null}
      </td>
      <td className="py-3">
        <Chip label={label} />
      </td>
      <td className="mono break-words text-xs text-slate-500 py-3">{source}</td>
    </tr>
  );
}

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-slate-200 text-left font-mono text-[11px] uppercase tracking-wider text-slate-400">
        <th scope="col" className="pb-2.5 font-semibold">Field</th>
        <th scope="col" className="pb-2.5 font-semibold">Value</th>
        <th scope="col" className="pb-2.5 font-semibold">Label</th>
        <th scope="col" className="pb-2.5 font-semibold">Source</th>
      </tr>
    </thead>
  );
}

function roundLine(round: RoundInfo): string {
  const end = round.status === "passed" ? `answer ${round.answerTx ? "recorded" : "missing"}` : `resolve ${round.resolveTx ? "recorded" : "missing"}`;
  return `Round ${round.id} · deal ${round.dealId} · index ${formatCount(round.index)} · ${round.status} · challenge ${formatCount(round.startBlock)} → ${end}`;
}

/** The one screen this check-in needs: what is deployed, what the chain holds now, and how to check it. */
export function Overview(options: LiveOptions) {
  const mode = useMode();
  const evidence = useEvidence();
  const bundle: EvidenceBundle | null = evidence.bundle;
  const deals = bundle?.deals ?? [];
  const providerAddress = bundle?.providers[0]?.address ?? null;
  const live = useLiveDeployment(mode, {
    ...options,
    providerAddress,
    dealIds: deals.map((deal) => deal.id),
  });

  const liveDeals = useLiveDeals(mode, {
    client: options.client,
    nextDealId: live.config?.nextDealId ?? null,
    block: live.block,
  });

  const config = live.config ?? bundle?.config ?? null;
  const liveLabel: Label = live.config ? "MEASURED" : "REPORTED";
  const configSource = live.config
    ? `chain ${mode.expectedChainId} @ block ${formatCount(live.block ?? 0)} · ${live.at}`
    : `evidence/${bundle?.id ?? "none"}.json`;
  const recordedSource = `evidence/${bundle?.id ?? "none"}.json`;

  const deployment = bundle?.deployment ?? null;
  const codeVerified = deployment?.codeVerified ?? null;
  const provider = live.provider ?? bundle?.providers[0] ?? null;
  const bondSource = live.provider ? configSource : recordedSource;
  const txById = new Map((bundle?.transactions ?? []).map((tx) => [tx.id, tx]));
  const txRow = (id: string, field: string) => {
    const tx = txById.get(id);
    return (
      <Row
        key={id}
        field={field}
        value={<BlockLink block={tx?.block} />}
        detail={tx?.hash ?? undefined}
        label="REPORTED"
        source={tx?.evidence ?? recordedSource}
      />
    );
  };

  return (
    <div className="space-y-10">
      {/* Dark Hero Panel with editorial typography & highlight pill */}
      <Hero
        headline={
          <>
            Don't trust your storage provider. Make them{" "}
            <span className="highlight-pill">prove</span> it.
          </>
        }
        subtitle="A storage-proof deployment on Portaldot testnet: an owner commits a file Merkle root, a provider answers random block challenges, and a wrong or missing answer costs bond. This status dashboard is strictly read-only — it holds no keys and cannot sign or spend."
      >
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-slate-200 border border-white/15">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            01 / deployment
          </span>
          <span className="text-slate-400">
            Makhzan on chain {mode.expectedChainId}
          </span>
        </div>

        {live.status === "live" ? (
          <p className="mt-4 font-mono text-xs text-ochre" data-testid="live-source">
            Measured live — block {formatCount(live.block ?? 0)} · chain {mode.expectedChainId} ·{" "}
            {hostOf(mode.rpcUrl)} · {live.at}
          </p>
        ) : null}

        {live.status === "blocked" ? (
          <p role="alert" className="mt-4 border-l-2 border-red py-1 pl-3 text-sm text-red-200">
            {live.blockingDetail}
          </p>
        ) : null}

        {live.status === "error" ? (
          <p
            role="note"
            data-testid={live.stale ? "live-stale" : undefined}
            className="mt-4 border-l-2 border-amber-400 py-1 pl-3 text-sm text-amber-200"
          >
            {live.stale
              ? `STALE — the last live read failed (${live.error ?? "unknown error"}). Showing the last good value from ${live.at ?? "an earlier read"}.`
              : `live read failed (${live.error ?? "unknown error"}); showing the last good value or the recorded evidence.`}
          </p>
        ) : null}

        {mode.clientEnabled ? (
          <div className="mt-5">
            <button
              type="button"
              aria-label="Re-read deployment status from RPC"
              onClick={live.refresh}
              className="inline-flex min-h-[38px] items-center justify-center rounded-full bg-white/10 px-4 py-1.5 font-mono text-xs font-medium text-white border border-white/20 hover:bg-white/20 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-ochre"
            >
              Re-read
            </button>
          </div>
        ) : null}
      </Hero>

      {/* Stats Strip */}
      <section
        aria-labelledby="overview-stats-heading"
        data-testid="overview-stats-strip"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <h2 id="overview-stats-heading" className="sr-only">
          Platform statistics
        </h2>
        <Stat
          value={formatCount(live.status === "live" ? liveDeals.counts.created : (bundle?.config?.nextDealId ?? bundle?.deals.length ?? 2))}
          subtitle="deals created"
          label={live.status === "live" ? "MEASURED" : "REPORTED"}
          detail={live.status === "live" ? "nextDealId read from chain" : "deals 1 & 2 recorded in evidence"}
        />
        <Stat
          value={formatCount(live.status === "live" ? liveDeals.counts.settled : 2)}
          subtitle="settled"
          label={live.status === "live" ? "MEASURED" : "REPORTED"}
          detail={live.status === "live" ? "healthOf = 0 (settled or none)" : "deals 1 & 2 settled on Portaldot"}
        />
        <Stat
          value={formatCount(live.status === "live" ? liveDeals.counts.healthyNow : 0)}
          subtitle="healthy now"
          label={live.status === "live" ? "MEASURED" : "REPORTED"}
          detail={live.status === "live" ? "active term before end block" : "no deals currently active"}
        />
        <Stat
          value="6 tPOT"
          subtitle="slashed = exactly 20% of the bond"
          label="REPORTED"
          detail="round 2 slashed in block 172,658"
        />
      </section>

      {/* Judges Strip */}
      <Card
        as="section"
        aria-labelledby="judges-strip-heading"
        data-testid="judges-strip"
        className="border-slate-200/90 bg-white"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <h2 id="judges-strip-heading" className="eyebrow text-slate-700 font-semibold">
            Start here for judges
          </h2>
          <span className="font-mono text-xs text-slate-400">Essential verification routes</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            to="/verify"
            className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 font-mono text-xs text-slate-800 no-underline transition-all hover:border-ochre hover:bg-white hover:text-slate-900 shadow-xs"
          >
            <span>Verify a file</span>
            <span aria-hidden="true" className="text-ochre font-bold">→</span>
          </Link>
          <Link
            to="/replay"
            className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 font-mono text-xs text-slate-800 no-underline transition-all hover:border-ochre hover:bg-white hover:text-slate-900 shadow-xs"
          >
            <span>Watch the slash replay</span>
            <span aria-hidden="true" className="text-ochre font-bold">→</span>
          </Link>
          <Link
            to="/gate"
            className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 font-mono text-xs text-slate-800 no-underline transition-all hover:border-ochre hover:bg-white hover:text-slate-900 shadow-xs"
          >
            <span>See the gate</span>
            <span aria-hidden="true" className="text-ochre font-bold">→</span>
          </Link>
        </div>
      </Card>

      {/* Three Action Cards */}
      <section
        aria-labelledby="action-cards-heading"
        data-testid="overview-action-cards"
        className="grid grid-cols-1 gap-6 md:grid-cols-3"
      >
        <h2 id="action-cards-heading" className="sr-only">
          Quick Actions
        </h2>
        <Card className="flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between">
              <span className="eyebrow text-slate-500">01 / VERIFICATION</span>
              <Chip label="REPORTED" tone="neutral" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-900">Verify a file</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Hash a sample file block-by-block directly in your browser and check against the live on-chain Merkle root.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <Button to="/verify" variant="primary" className="w-full">
              Verify a file →
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between">
              <span className="eyebrow text-slate-500">02 / PENALTY AUDIT</span>
              <Chip label="REPORTED" tone="neutral" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-900">Watch slash replay</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Examine the step-by-step cryptographic proof challenge failure where provider 1 lost 6 tPOT bond.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <Button to="/replay" variant="secondary" className="w-full">
              Watch replay →
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div className="flex items-center justify-between">
              <span className="eyebrow text-slate-500">03 / ESCROW GATE</span>
              <Chip label="REPORTED" tone="neutral" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-slate-900">Inspect StorageGate</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Read the unforgeable escrow gate contract that requires storage verification before funds release.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <Button to="/gate" variant="dark" className="w-full">
              See the gate →
            </Button>
          </div>
        </Card>
      </section>

      {/* Live Deals Card */}
      <Card
        as="section"
        aria-labelledby="live-deals-heading"
        data-testid="overview-live-deals-card"
        className="border-slate-200/90 bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 id="live-deals-heading" className="eyebrow text-slate-700 font-semibold">
              Live deals
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Latest deals on chain {mode.expectedChainId} read from Makhzan storage. Each row links to its full deal view.
            </p>
          </div>
          <Chip label={liveLabel} />
        </div>

        {liveDeals.status === "error" && liveDeals.deals.length === 0 ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50/50 p-4 text-sm text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold">RPC read failed</p>
              <p className="text-xs text-red-600 mt-0.5">{liveDeals.error ?? "Failed to read live deals from chain"}</p>
            </div>
            <button
              type="button"
              onClick={liveDeals.retry}
              className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : liveDeals.status === "live" && liveDeals.deals.length === 0 ? (
          <div className="mt-4 p-8 text-center text-sm text-slate-500 rounded-xl border border-dashed border-slate-200">
            No deals created yet on-chain.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                  <th scope="col" className="pb-2.5 font-semibold">Deal</th>
                  <th scope="col" className="pb-2.5 font-semibold">Owner</th>
                  <th scope="col" className="pb-2.5 font-semibold">Provider</th>
                  <th scope="col" className="pb-2.5 font-semibold">Price</th>
                  <th scope="col" className="pb-2.5 font-semibold">End block</th>
                  <th scope="col" className="pb-2.5 font-semibold">Blocks left</th>
                  <th scope="col" className="pb-2.5 font-semibold">Flags</th>
                  <th scope="col" className="pb-2.5 font-semibold">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(liveDeals.deals.length > 0
                  ? liveDeals.deals
                  : deals.map((d) => ({
                      id: d.id,
                      owner: (d.owner ?? "0x0948EBD7637D1C32858a6FC5D947E85A6600205C") as Hex,
                      providerId: d.providerId ?? 1,
                      priceUnits: d.priceUnits ?? "500000000000000",
                      startBlock: d.startBlock ?? 172266,
                      endBlock: d.endBlock ?? 172416,
                      blocksLeft: 0,
                      flags: d.flags ?? 1,
                      health: d.health ?? 0,
                      healthLabel: "settled or none" as const,
                    }))
                ).map((deal) => (
                  <tr key={deal.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 font-mono font-semibold text-xs">
                      <Link
                        to={`/deal/${deal.id}`}
                        className="text-ochre hover:underline inline-flex items-center gap-1"
                      >
                        Deal {deal.id} <span aria-hidden="true" className="text-[10px]">→</span>
                      </Link>
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-700">
                      <span title={deal.owner}>
                        {deal.owner.length > 12
                          ? `${deal.owner.slice(0, 6)}…${deal.owner.slice(-4)}`
                          : deal.owner}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-700">
                      provider {deal.providerId}
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-900">
                      {formatNative(deal.priceUnits)} tPOT
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-700">
                      <BlockLink block={deal.endBlock} />
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-700">
                      {formatCount(deal.blocksLeft)}
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-700">
                      {deal.flags}
                    </td>
                    <td className="py-3">
                      <span className="font-mono text-xs font-medium text-slate-800">
                        {deal.healthLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Gate Demo Card */}
      <Card
        as="section"
        aria-labelledby="gate-demo-heading"
        data-testid="overview-gate-demo-card"
        className="border-slate-200/90 bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 id="gate-demo-heading" className="eyebrow text-slate-700 font-semibold">
              Gate demo
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Recorded live-run StorageGate operations and refusal outcomes from evidence/raw/t8/ on chain 420420777.
            </p>
          </div>
          <Chip label="REPORTED" />
        </div>

        <div className="mt-4 space-y-3">
          <Link
            to="/gate"
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/60 transition-colors no-underline"
          >
            <div>
              <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-ochre transition-colors">
                Deal 4: locked and released (2 tPOT to provider-1)
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Released at block 252,538 while provider bond was 24 tPOT (tx 0x4c63d339...)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip label="REPORTED" tone="neutral" />
              <span aria-hidden="true" className="text-xs text-slate-400 font-mono">→</span>
            </div>
          </Link>

          <Link
            to="/gate"
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/60 transition-colors no-underline"
          >
            <div>
              <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-ochre transition-colors">
                Deal 5: locked with 2 tPOT, refunded to payer
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Payment refunded to payer 0x0948EBD7... after deal expiry (lock tx 0xf84af2e3...)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip label="REPORTED" tone="neutral" />
              <span aria-hidden="true" className="text-xs text-slate-400 font-mono">→</span>
            </div>
          </Link>

          <Link
            to="/gate"
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/60 transition-colors no-underline"
          >
            <div>
              <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-ochre transition-colors">
                Deal 3: lock refused Expired
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                CLI refused lock simulation at block 251,940 because block &gt;= endBlock (250,692). 0 gas spent.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip label="REPORTED" tone="neutral" />
              <span aria-hidden="true" className="text-xs text-slate-400 font-mono">→</span>
            </div>
          </Link>

          <Link
            to="/gate"
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/60 transition-colors no-underline"
          >
            <div>
              <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-ochre transition-colors">
                Deal 5: release refused BondTooLow
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Release reverted at block 252560 because active bond 24.0 tPOT was below the 30.0 tPOT floor.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip label="REPORTED" tone="neutral" />
              <span aria-hidden="true" className="text-xs text-slate-400 font-mono">→</span>
            </div>
          </Link>

          <Link
            to="/gate"
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100/60 transition-colors no-underline"
          >
            <div>
              <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-ochre transition-colors">
                Deal 5: refund refused RefundNotAllowed
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Refund reverted at block 252564 because deal was healthy and before endBlock (255,544).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip label="REPORTED" tone="neutral" />
              <span aria-hidden="true" className="text-xs text-slate-400 font-mono">→</span>
            </div>
          </Link>
        </div>
      </Card>

      {/* Deployment Card */}
      <Card as="section" aria-labelledby="deployment-heading">
        <h2 id="deployment-heading" className="eyebrow text-slate-700 font-semibold">
          Deployment
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm border-b border-slate-100 pb-4">
          <div>
            <dt className="text-xs font-mono uppercase text-slate-500">Contract address</dt>
            <dd className="mono mt-1 break-all font-medium text-slate-900">{deployment?.address ?? "not recorded in the evidence"}</dd>
          </div>
          <div>
            <dt className="text-xs font-mono uppercase text-slate-500">Deployment transaction</dt>
            <dd className="mono mt-1 break-all font-medium text-slate-900">{deployment?.txHash ?? "not recorded in the evidence"}</dd>
          </div>
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              <col className="w-[34%]" />
            </colgroup>
            <caption>Deployment facts, transcribed from the recorded verification run.</caption>
            <TableHead />
            <tbody className="divide-y divide-slate-100">
              <Row
                field="Block"
                value={<BlockLink block={deployment?.block} />}
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Chain id"
                value={String(bundle?.chain.chainId ?? mode.expectedChainId)}
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Deploy receipt"
                value={bundle?.transactions[0]?.status ?? "not recorded"}
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Runtime bytes"
                value={deployment ? formatCount(deployment.runtimeBytes) : "not recorded"}
                unit="bytes"
                label="REPORTED"
                source={recordedSource}
              />
            </tbody>
          </table>
        </div>
      </Card>

      {/* Code Card */}
      <Card as="section" aria-labelledby="code-heading">
        <h2 id="code-heading" className="eyebrow text-slate-700 font-semibold">
          Code
        </h2>
        <div className="mt-4 space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">verified — runtime code matches the build artifact</span>
            <Chip label="REPORTED" />
          </p>
          <p className="mono break-all text-xs text-slate-600">
            runtime code hash {deployment?.codeHash ?? "not recorded"}
          </p>
          <p className="text-xs text-slate-500">
            {codeVerified?.artifact ?? "no artifact recorded"} · {codeVerified?.note ?? ""}
          </p>
          <p className="text-xs text-slate-500">
            source verification: {codeVerified?.sourceVerified ? "present" : "not available on this network (no explorer)"}.
          </p>
          {live.codeHash ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" data-testid="live-code">
              <p>
                <Chip label="MEASURED" /> runtime code hash{" "}
                <span className="mono break-all font-medium text-slate-900">{live.codeHash}</span> ·{" "}
                {formatCount(live.codeBytes ?? 0)} bytes
              </p>
              <p className="mt-1 text-slate-500">
                {live.codeHash === deployment?.codeHash
                  ? "matches the recorded hash"
                  : "differs from the recorded hash"}
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Results Card */}
      <Card as="section" aria-labelledby="results-heading">
        <h2 id="results-heading" className="eyebrow text-slate-700 font-semibold">
          Live results
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm text-slate-600 leading-relaxed">
          The chain now, then the run that produced it. Deals 1 and 2 are both settled on this
          deployment: deal 1 was answered in time, deal 2 took one slash. Health 0 is the settled
          state, not a fault — a deal ends at 0 whether it was answered or slashed, so read the
          rounds below to see which happened.
        </p>
        <div
          className="mt-4 overflow-x-auto"
          data-testid={live.status === "live" ? "live-results" : undefined}
        >
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              <col className="w-[34%]" />
            </colgroup>
            <caption>Read by this browser on each refresh.</caption>
            <TableHead />
            <tbody className="divide-y divide-slate-100">
              <Row
                field="Provider 1 bond"
                value={provider ? formatNative(provider.bondUnits) : "not recorded"}
                unit="tPOT"
                label={live.provider ? "MEASURED" : "REPORTED"}
                source={bondSource}
              />
              {deals.map((deal) => {
                const health = live.health[deal.id] ?? deal.health;
                return (
                  <Row
                    key={deal.id}
                    field={`Deal ${deal.id} health`}
                    value={health === null ? "not read" : String(health)}
                    unit={health === null ? undefined : HEALTH_TEXT[health]}
                    label={live.health[deal.id] !== undefined && live.health[deal.id] !== null ? "MEASURED" : "REPORTED"}
                    source={live.health[deal.id] !== undefined && live.health[deal.id] !== null ? configSource : recordedSource}
                  />
                );
              })}
              {live.balanceWei !== null ? (
                <Row
                  field="Contract balance"
                  value={formatWeiAsNative(live.balanceWei)}
                  unit="tPOT"
                  label="MEASURED"
                  source={configSource}
                />
              ) : null}
            </tbody>
          </table>
        </div>
        {live.balanceWei === null ? (
          <p className="mt-3 text-xs text-slate-500">
            The contract balance was not part of the recorded evidence; it appears when the live read
            answers.
          </p>
        ) : null}

        <h3 className="mt-8 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500">Recorded run</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              <col className="w-[34%]" />
            </colgroup>
            <caption>Every transaction below has a receipt file; the block is the inclusion block.</caption>
            <TableHead />
            <tbody className="divide-y divide-slate-100">
              {txRow("deploy", "Deploy")}
              {txRow("register", "Register provider 1")}
              {txRow("answer-2a", "Pass answer (deal 2)")}
              {txRow("resolve-2b", "Slash resolve (deal 2)")}
              <Row
                field="Slash"
                value="6"
                unit="tPOT"
                detail="exactly 20% of the 30 tPOT bond; owner credited exactly 6 tPOT"
                label="REPORTED"
                source={recordedSource}
              />
              {txRow("claim-1", "Claim deal 1")}
              {txRow("settle-1", "Settle deal 1")}
              {txRow("claim-2", "Claim deal 2")}
              {txRow("settle-2", "Settle deal 2")}
            </tbody>
          </table>
        </div>
      </Card>

      {/* On-Chain Config Card */}
      <Card as="section" aria-labelledby="config-heading">
        <h2 id="config-heading" className="eyebrow text-slate-700 font-semibold">
          On-chain configuration
        </h2>
        <p className="mt-2 max-w-[68ch] text-sm text-slate-600 leading-relaxed">
          Decoded from packed storage slot 0. {live.config ? "These values were read by this browser." : "These values are the recorded ones; a live read replaces them when an RPC answers."}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              <col className="w-[34%]" />
            </colgroup>
            <caption>Packed slot 0, field by field.</caption>
            <TableHead />
            <tbody className="divide-y divide-slate-100">
              {config === null ? (
                <tr>
                  <td colSpan={4} className="text-slate-500 py-3">
                    No configuration is recorded and no live read has answered.
                  </td>
                </tr>
              ) : (
                <>
                  <Row field="Challenge window" value={formatCount(config.challengeWindowBlocks)} unit="blocks" label={liveLabel} source={configSource} />
                  <Row field="Challenge block size" value={formatCount(config.challengeBlockSize)} unit="bytes" label={liveLabel} source={configSource} />
                  <Row field="Slash" value={formatCount(config.slashBps)} unit="bps" label={liveLabel} source={configSource} />
                  <Row field="Minimum bond" value={formatNative(config.minBondUnits)} unit="tPOT" label={liveLabel} source={configSource} />
                  <Row field="Minimum duration" value={formatCount(config.minDurationBlocks)} unit="blocks" label={liveLabel} source={configSource} />
                  <Row field="Maximum duration" value={formatCount(config.maxDurationBlocks)} unit="blocks" label={liveLabel} source={configSource} />
                  <Row field="Deals created" value={formatCount(config.nextDealId)} label={liveLabel} source={configSource} />
                  <Row field="Next deal id" value={formatCount(config.nextDealId + 1)} detail={`last assigned: deal ${formatCount(config.nextDealId)}`} label={liveLabel} source={configSource} />
                  <Row field="Providers" value={formatCount(config.providerCount)} label={liveLabel} source={configSource} />
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Rounds Card */}
      <Card as="section" aria-labelledby="rounds-heading">
        <h2 id="rounds-heading" className="eyebrow text-slate-700 font-semibold">
          Live challenge rounds
        </h2>
        <p className="mt-3 text-sm">
          <span className="font-semibold text-slate-900">Recorded rounds: {formatCount(bundle?.rounds.length ?? 0)}</span>{" "}
          <Chip label="REPORTED" />{" "}
          <span className="text-slate-600">
            — {formatCount(bundle?.rounds.filter((round) => round.status === "passed").length ?? 0)} passed,{" "}
            {formatCount(bundle?.rounds.filter((round) => round.status === "failed").length ?? 0)} slashed.
          </span>
        </p>
        <ul className="mt-4 space-y-1.5 font-mono text-xs text-slate-700 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
          {(bundle?.rounds ?? []).map((round) => (
            <li key={round.id} className="py-0.5">{roundLine(round)}</li>
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Chip label="PENDING LIVE RUN" />
          <span className="font-medium text-slate-900">pending</span>
          <span className="text-slate-600">
            — no new challenge is scheduled; a round appears here only when the chain records one.
          </span>
        </p>
      </Card>

      {/* Source and reading Card */}
      <Card as="section" aria-labelledby="links-heading">
        <h2 id="links-heading" className="eyebrow text-slate-700 font-semibold">
          Source and reading
        </h2>
        <ul className="mt-3 flex flex-wrap gap-6 text-sm font-medium">
          <li>
            <a className="link-quiet underline hover:text-slate-900" href={REPO}>
              Repository
            </a>
          </li>
          <li>
            <a className="link-quiet underline hover:text-slate-900" href={`${REPO}#readme`}>
              README
            </a>
          </li>
          <li>
            <a className="link-quiet underline hover:text-slate-900" href="/evidence/index.json">
              evidence manifest
            </a>
          </li>
        </ul>
        <p className="mt-4 max-w-[68ch] text-xs text-slate-500 leading-relaxed">
          Read-only: there is no wallet, no key and no write function in this build. The recorded layer is
          verified by SHA-256 before it is shown, and every live number carries the block and UTC time it
          was read at.
        </p>
      </Card>
    </div>
  );
}
