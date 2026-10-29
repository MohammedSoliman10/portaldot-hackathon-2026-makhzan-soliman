import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMode } from "../app/app-context";
import { BlockLink } from "../components/BlockLink";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, formatWeiAsNative, type Label } from "../data/labels";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";
import type { EvidenceBundle, RoundInfo } from "../data/schema";

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

function Chip({ label }: { label: Label }) {
  return (
    <span className="label-chip" data-label={label}>
      {label}
    </span>
  );
}

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
    <tr>
      <td className="break-words text-ash">{field}</td>
      <td className="numeral">
        {value}
        {unit ? (
          <>
            {" "}
            <span className="text-ash">{unit}</span>
          </>
        ) : null}
        {detail ? <p className="mono mt-1 break-words text-xs text-ash-2">{detail}</p> : null}
      </td>
      <td>
        <Chip label={label} />
      </td>
      <td className="mono break-words text-xs text-ash-2">{source}</td>
    </tr>
  );
}

function TableHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Field</th>
        <th scope="col">Value</th>
        <th scope="col">Label</th>
        <th scope="col">Source</th>
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
    <section className="space-y-12">
      <header>
        <p className="eyebrow">01 / deployment</p>
        <h1 className="mt-2 text-xl">Makhzan on Portaldot testnet</h1>
        <p className="mt-3 max-w-[62ch] text-paper-dim">
          A storage-proof deployment: an owner commits a file root, a provider answers random block
          challenges, and a wrong or missing answer costs bond. This page reads. It cannot sign, send
          or spend, and it holds no key.
        </p>

        {live.status === "live" ? (
          <p className="mt-4 font-mono text-xs text-ochre" data-testid="live-source">
            Measured live — block {formatCount(live.block ?? 0)} · chain {mode.expectedChainId} ·{" "}
            {hostOf(mode.rpcUrl)} · {live.at}
          </p>
        ) : null}

        {live.status === "blocked" ? (
          <p role="alert" className="mt-4 border-l-2 border-red py-1 pl-3 text-sm">
            {live.blockingDetail}
          </p>
        ) : null}

        {live.status === "error" ? (
          <p
            role="note"
            data-testid={live.stale ? "live-stale" : undefined}
            className="mt-4 border-l-2 border-ochre-dim py-1 pl-3 text-sm"
          >
            {live.stale
              ? `STALE — the last live read failed (${live.error ?? "unknown error"}). Showing the last good value from ${live.at ?? "an earlier read"}.`
              : `live read failed (${live.error ?? "unknown error"}); showing the last good value or the recorded evidence.`}
          </p>
        ) : null}

        {mode.clientEnabled ? (
          <button
            type="button"
            aria-label="Re-read deployment status from RPC"
            onClick={live.refresh}
            className="mt-4 border border-rule-strong px-3 py-1 font-mono text-xs hover:border-ochre hover:text-ochre"
          >
            Re-read
          </button>
        ) : null}
      </header>

      <section
        aria-labelledby="judges-strip-heading"
        data-testid="judges-strip"
        className="border border-rule-strong bg-ink-2 p-4"
      >
        <h2 id="judges-strip-heading" className="eyebrow">
          Start here for judges
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            to="/verify"
            className="flex min-h-[44px] items-center justify-between border border-rule px-4 py-2 font-mono text-xs text-paper no-underline transition-colors hover:border-ochre hover:text-ochre"
          >
            <span>Verify a file</span>
            <span aria-hidden="true" className="text-ash">→</span>
          </Link>
          <Link
            to="/replay"
            className="flex min-h-[44px] items-center justify-between border border-rule px-4 py-2 font-mono text-xs text-paper no-underline transition-colors hover:border-ochre hover:text-ochre"
          >
            <span>Watch the slash replay</span>
            <span aria-hidden="true" className="text-ash">→</span>
          </Link>
          <Link
            to="/gate"
            className="flex min-h-[44px] items-center justify-between border border-rule px-4 py-2 font-mono text-xs text-paper no-underline transition-colors hover:border-ochre hover:text-ochre"
          >
            <span>See the gate</span>
            <span aria-hidden="true" className="text-ash">→</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="deployment-heading">
        <h2 id="deployment-heading" className="eyebrow">
          Deployment
        </h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-ash">Contract address</dt>
            <dd className="mono break-all">{deployment?.address ?? "not recorded in the evidence"}</dd>
          </div>
          <div>
            <dt className="text-ash">Deployment transaction</dt>
            <dd className="mono break-all">{deployment?.txHash ?? "not recorded in the evidence"}</dd>
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
            <tbody>
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
      </section>

      <section aria-labelledby="code-heading">
        <h2 id="code-heading" className="eyebrow">
          Code
        </h2>
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-paper">verified — runtime code matches the build artifact</span>
            <Chip label="REPORTED" />
          </p>
          <p className="mono break-all text-xs text-ash">
            runtime code hash {deployment?.codeHash ?? "not recorded"}
          </p>
          <p className="text-xs text-ash">
            {codeVerified?.artifact ?? "no artifact recorded"} · {codeVerified?.note ?? ""}
          </p>
          <p className="text-xs text-ash">
            source verification: {codeVerified?.sourceVerified ? "present" : "not available on this network (no explorer)"}.
          </p>
          {live.codeHash ? (
            <div className="text-xs" data-testid="live-code">
              <p>
                <Chip label="MEASURED" /> runtime code hash{" "}
                <span className="mono break-all">{live.codeHash}</span> ·{" "}
                {formatCount(live.codeBytes ?? 0)} bytes
              </p>
              <p className="mt-1 text-ash">
                {live.codeHash === deployment?.codeHash
                  ? "matches the recorded hash"
                  : "differs from the recorded hash"}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="results-heading">
        <h2 id="results-heading" className="eyebrow">
          Live results
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-paper-dim">
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
            <tbody>
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
          <p className="mt-2 text-xs text-ash">
            The contract balance was not part of the recorded evidence; it appears when the live read
            answers.
          </p>
        ) : null}

        <h3 className="mt-8 font-mono text-xs text-ash">Recorded run</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
              <col className="w-[34%]" />
            </colgroup>
            <caption>Every transaction below has a receipt file; the block is the inclusion block.</caption>
            <TableHead />
            <tbody>
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
      </section>

      <section aria-labelledby="config-heading">
        <h2 id="config-heading" className="eyebrow">
          On-chain configuration
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-paper-dim">
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
            <tbody>
              {config === null ? (
                <tr>
                  <td colSpan={4} className="text-ash">
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
                  <Row field="Next deal id" value={formatCount(config.nextDealId)} label={liveLabel} source={configSource} />
                  <Row field="Providers" value={formatCount(config.providerCount)} label={liveLabel} source={configSource} />
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="rounds-heading">
        <h2 id="rounds-heading" className="eyebrow">
          Live challenge rounds
        </h2>
        <p className="mt-3 text-sm">
          <span className="text-paper">Recorded rounds: {formatCount(bundle?.rounds.length ?? 0)}</span>{" "}
          <Chip label="REPORTED" />{" "}
          <span className="text-paper-dim">
            — {formatCount(bundle?.rounds.filter((round) => round.status === "passed").length ?? 0)} passed,{" "}
            {formatCount(bundle?.rounds.filter((round) => round.status === "failed").length ?? 0)} slashed.
          </span>
        </p>
        <ul className="mt-3 space-y-1 font-mono text-xs text-paper-dim">
          {(bundle?.rounds ?? []).map((round) => (
            <li key={round.id}>{roundLine(round)}</li>
          ))}
        </ul>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Chip label="PENDING LIVE RUN" />
          <span className="text-paper">pending</span>
          <span className="text-paper-dim">
            — no new challenge is scheduled; a round appears here only when the chain records one.
          </span>
        </p>
      </section>

      <section aria-labelledby="links-heading">
        <h2 id="links-heading" className="eyebrow">
          Source and reading
        </h2>
        <ul className="mt-3 flex flex-wrap gap-6 text-sm">
          <li>
            <a className="link-quiet underline" href={REPO}>
              Repository
            </a>
          </li>
          <li>
            <a className="link-quiet underline" href={`${REPO}#readme`}>
              README
            </a>
          </li>
          <li>
            <a className="link-quiet underline" href="/evidence/index.json">
              evidence manifest
            </a>
          </li>
        </ul>
        <p className="mt-4 max-w-[62ch] text-xs text-ash">
          Read-only: there is no wallet, no key and no write function in this build. The recorded layer is
          verified by SHA-256 before it is shown, and every live number carries the block and UTC time it
          was read at.
        </p>
      </section>
    </section>
  );
}
