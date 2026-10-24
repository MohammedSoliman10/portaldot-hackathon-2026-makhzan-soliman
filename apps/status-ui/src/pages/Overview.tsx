import { useMode } from "../app/app-context";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, type Label } from "../data/labels";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";

const REPO = "https://github.com/MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman";

const hostOf = (rpcUrl: string | null): string => {
  if (!rpcUrl) return "no RPC";
  try {
    return new URL(rpcUrl).host;
  } catch {
    return rpcUrl;
  }
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
  label,
  source,
}: {
  field: string;
  value: string;
  unit?: string;
  label: Label;
  source: string;
}) {
  return (
    <tr>
      <td className="text-ash">{field}</td>
      <td className="numeral whitespace-nowrap">
        {value}
        {unit ? (
          <>
            {" "}
            <span className="text-ash">{unit}</span>
          </>
        ) : null}
      </td>
      <td>
        <Chip label={label} />
      </td>
      <td className="mono break-words text-xs text-ash-2">{source}</td>
    </tr>
  );
}

/** The one screen this check-in needs: what is deployed, what it is configured to do, and how to check it. */
export function Overview(options: LiveOptions) {
  const mode = useMode();
  const evidence = useEvidence();
  const bundle = evidence.bundle;
  const live = useLiveDeployment(mode, options);

  const config = live.config ?? bundle?.config ?? null;
  const liveLabel: Label = live.config ? "MEASURED" : "REPORTED";
  const configSource = live.config
    ? `chain ${mode.expectedChainId} @ block ${formatCount(live.block ?? 0)} · ${live.at}`
    : `evidence/${bundle?.id ?? "none"}.json`;

  const deployment = bundle?.deployment ?? null;
  const codeVerified = deployment?.codeVerified ?? null;
  const recordedSource = `evidence/${bundle?.id ?? "none"}.json`;

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
            onClick={live.refresh}
            className="mt-4 border border-rule-strong px-3 py-1 font-mono text-xs hover:border-ochre hover:text-ochre"
          >
            Re-read
          </button>
        ) : null}
      </header>

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
        <table className="w-full">
          <caption>Deployment facts, transcribed from the recorded verification run.</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Value</th>
              <th scope="col">Label</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            <Row
              field="Block"
              value={deployment ? formatCount(deployment.block ?? 0) : "not recorded"}
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

      <section aria-labelledby="config-heading">
        <h2 id="config-heading" className="eyebrow">
          On-chain configuration
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-paper-dim">
          Decoded from packed storage slot 0. {live.config ? "These values were read by this browser." : "These values are the recorded ones; a live read replaces them when an RPC answers."}
        </p>
        <div className="mt-4 overflow-x-auto">
        <table className="w-full">
          <caption>Packed slot 0, field by field.</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Value</th>
              <th scope="col">Label</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
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
        {live.config && config ? (
          <p className="mt-2 text-xs text-ash">
            Recorded values for comparison: window {formatCount(bundle?.config.challengeWindowBlocks ?? 0)}, block size{" "}
            {formatCount(bundle?.config.challengeBlockSize ?? 0)}, slash {formatCount(bundle?.config.slashBps ?? 0)} bps.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="rounds-heading">
        <h2 id="rounds-heading" className="eyebrow">
          Live challenge rounds
        </h2>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Chip label="PENDING LIVE RUN" />
          <span className="text-paper">pending</span>
          <span className="text-paper-dim">
            — no challenge round has been created: next deal id {formatCount(config?.nextDealId ?? 0)},
            providers {formatCount(config?.providerCount ?? 0)}.
          </span>
        </p>
        <p className="mt-2 max-w-[62ch] text-xs text-ash">
          Nothing has been challenged, answered or slashed on this deployment. A round appears here only
          when the chain records one; an empty list is not a pass.
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
