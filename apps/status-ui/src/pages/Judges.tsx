import { Link } from "react-router-dom";
import { useMode } from "../app/app-context";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, type Label } from "../data/labels";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";

const DESIGN_NOTE =
  "Why not the native TransactionStorage pallet: it stores bytes but, as far as we can tell, has no promise, payment or penalty; Makhzan adds a bonded provider, a random challenge and a slash.";

const short = (value: string): string => `${value.slice(0, 10)}…${value.slice(-6)}`;

function Chip({ label }: { label: Label }) {
  return (
    <span className="label-chip" data-label={label}>
      {label}
    </span>
  );
}

function Line({
  what,
  value,
  detail,
  label,
  href,
  source,
}: {
  what: string;
  value: string;
  detail?: string;
  label: Label;
  href: string;
  source: string;
}) {
  return (
    <div data-judges-row className="border-t border-rule py-2 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs text-ash">{what}</dt>
      <dd className="mt-1 text-sm sm:mt-0">
        <span className="numeral break-words">{value}</span> <Chip label={label} />
        {detail ? <p className="mono mt-1 break-all text-xs text-ash-2">{detail}</p> : null}
        <p className="mt-1 text-[11px] text-ash-2">
          <a className="link-quiet underline" href={href}>
            evidence
          </a>
          <span className="mono break-words"> · {source}</span>
        </p>
      </dd>
    </div>
  );
}

/** The two-minute path through the deployment, plus the honest edges of what it proves. */
export function Judges(options: LiveOptions) {
  const mode = useMode();
  const evidence = useEvidence();
  const bundle = evidence.bundle;
  const live = useLiveDeployment(mode, {
    ...options,
    providerAddress: bundle?.providers[0]?.address ?? null,
    dealIds: bundle?.deals.map((deal) => deal.id) ?? [],
  });

  const evidenceId = bundle?.id ?? "portaldot-live-run2";
  const evidenceHref = `/evidence/${evidenceId}.json`;
  const tx = (id: string) => bundle?.transactions.find((entry) => entry.id === id) ?? null;
  const slash = bundle?.rounds.find((round) => round.status === "failed") ?? null;
  const retrieval = bundle?.retrieval ?? null;
  const provider = live.provider ?? bundle?.providers[0] ?? null;
  const bondLabel: Label = live.provider ? "MEASURED" : "REPORTED";
  const bondSource = live.provider
    ? `chain ${mode.expectedChainId} @ block ${formatCount(live.block ?? 0)} · ${live.at}`
    : `evidence/${evidenceId}.json`;
  const txLine = (id: string, what: string, note: string) => {
    const entry = tx(id);
    return {
      what,
      value: entry?.block === null || entry?.block === undefined ? "not recorded" : formatCount(entry.block),
      detail: entry?.hash ? `${entry.hash}${note === "" ? "" : ` · ${note}`}` : note || undefined,
      label: "REPORTED" as Label,
      href: evidenceHref,
      source: entry?.evidence ?? `evidence/${evidenceId}.json`,
    };
  };

  const lines = [
    txLine("deploy", "Deploy", "receipt success"),
    txLine("register", "Register provider 1", "30 tPOT bond"),
    txLine("answer-2a", "Pass", "deal 2, one block after the challenge"),
    {
      what: "Slash",
      value: slash
        ? `${formatNative(slash.bondBeforeUnits)} → ${formatNative(slash.bondAfterUnits)} tPOT`
        : "not recorded",
      detail: slash
        ? `resolve ${slash.resolveTx ? short(slash.resolveTx) : "not recorded"} at block ${formatCount(172658)} · exactly ${formatNative(slash.slashUnits)} tPOT credited to the owner`
        : undefined,
      label: "REPORTED" as Label,
      href: evidenceHref,
      source: `evidence/${evidenceId}.json`,
    },
    {
      what: "Claims and settles",
      value: ["claim-1", "settle-1", "claim-2", "settle-2"]
        .map((id) => tx(id)?.block)
        .filter((block): block is number => typeof block === "number")
        .map((block) => formatCount(block))
        .join(" / "),
      detail: "claim deal 1, settle deal 1, claim deal 2, settle deal 2",
      label: "REPORTED" as Label,
      href: evidenceHref,
      source: `evidence/${evidenceId}.json`,
    },
    {
      what: "Fresh-client retrieval",
      value: retrieval ? `${formatCount(retrieval.blockCount)} blocks` : "not recorded",
      detail: retrieval
        ? `sha256 ${retrieval.sha256}${retrieval.sha256Match ? " matches the upload" : " does not match the upload"}`
        : undefined,
      label: (retrieval ? "REPORTED" : "PENDING LIVE RUN") as Label,
      href: evidenceHref,
      source: retrieval?.source ?? `evidence/${evidenceId}.json`,
    },
    {
      what: "Tamper rejected",
      value: retrieval?.tamper.rejected ? "rejected" : "not recorded",
      detail: retrieval
        ? `first mismatching block ${formatCount(retrieval.tamper.firstMismatchingBlock)} · ${retrieval.tamper.error}`
        : undefined,
      label: (retrieval ? "REPORTED" : "PENDING LIVE RUN") as Label,
      href: evidenceHref,
      source: retrieval?.source ?? `evidence/${evidenceId}.json`,
    },
    {
      what: "Provider 1 bond now",
      value: provider ? `${formatNative(provider.bondUnits)} tPOT` : "not recorded",
      detail: provider ? "the bond the chain holds now, read by this page" : undefined,
      label: bondLabel,
      href: evidenceHref,
      source: bondSource,
    },
  ];

  return (
    <section className="space-y-10">
      <header>
        <p className="eyebrow">05 / judges</p>
        <h1 className="mt-2 text-xl">For judges</h1>
        <p className="mt-3 max-w-[62ch] text-paper-dim">
          Two minutes, four screens, then the list of what was measured live and what it does not prove.
          Everything here is read-only: no wallet, no key, no transaction.
        </p>
        {live.status === "live" ? (
          <p className="mt-3 font-mono text-xs text-ochre" data-testid="judges-live">
            Measured live — block {formatCount(live.block ?? 0)} · chain {mode.expectedChainId} · {live.at}
          </p>
        ) : null}
        {live.status === "error" ? (
          <p role="note" className="mt-3 border-l-2 border-ochre-dim py-1 pl-3 text-sm">
            {live.stale ? "STALE — " : ""}
            live read failed ({live.error ?? "unknown error"}); showing the recorded evidence.
          </p>
        ) : null}
      </header>

      <section aria-labelledby="walkthrough-heading">
        <h2 id="walkthrough-heading" className="eyebrow">
          The walkthrough
        </h2>
        <ol className="mt-3 max-w-[62ch] list-decimal space-y-3 pl-5 text-sm text-paper-dim">
          <li>
            <Link className="link-quiet underline" to="/">
              Overview
            </Link>{" "}
            — what is deployed, the code hash, the configuration and the live results: provider 1 bond,
            both deal healths and the contract balance.
          </li>
          <li>
            <Link className="link-quiet underline" to="/deal/1">
              Deals
            </Link>{" "}
            — deal 1 and deal 2 with <code className="mono">dealOf</code> and{" "}
            <code className="mono">healthOf</code> read from the chain now.
          </li>
          <li>
            <Link className="link-quiet underline" to="/proof">
              Proof
            </Link>{" "}
            — the one slash on this deployment: 30 → 24 tPOT, exactly 6 tPOT credited to the owner.
          </li>
          <li>
            <Link className="link-quiet underline" to="/verify">
              Verify
            </Link>{" "}
            — use the sample file, watch the root match deal 2, then flip one byte in a copy and watch it
            fail.
          </li>
        </ol>
      </section>

      <section aria-labelledby="measured-heading">
        <h2 id="measured-heading" className="eyebrow">
          What we measured live
        </h2>
        <p className="mt-2 max-w-[62ch] text-sm text-paper-dim">
          Each line points at the evidence file that records it. The last line is read from the chain by
          this page; the rest come from the recorded live run.
        </p>
        <dl className="mt-3">
          {lines.map((line) => (
            <Line key={line.what} {...line} />
          ))}
        </dl>
      </section>

      <section aria-labelledby="not-proven-heading" role="note" className="border border-rule p-4">
        <h2 id="not-proven-heading" className="text-base">
          What is not proven
        </h2>
        <ul className="mt-3 max-w-[62ch] list-disc space-y-2 pl-5 text-sm text-paper-dim">
          <li>
            This page cannot prove that a round ran. The receipts and the chain are the evidence; this is
            a read-only view of them.
          </li>
          <li>
            No explorer exists for chain {bundle?.chain.chainId ?? mode.expectedChainId}, so every
            transaction is backed by a receipt file, not a third-party explorer page.
          </li>
          <li>
            The provider in this run was a daemon on the same machine as the owner, not an independent
            operator. The bond and the slash are real; the independence is not.
          </li>
          <li>
            The pass answer on deal 1 at block 172,295 has no receipt file: the client timed out before
            writing it. Its hash and block come from the run log and are marked not-recorded.
          </li>
          <li>
            The live numbers are only as good as the RPC&apos;s answers. This page runs no light client
            and verifies no proof of the chain state.
          </li>
          <li>
            There is no independent audit and no source verification on an explorer: the runtime code
            hash is compared with the build artifact.
          </li>
        </ul>
      </section>

      <section aria-labelledby="design-note-heading" className="border border-rule p-4">
        <p className="flex flex-wrap items-center gap-2">
          <span className="label-chip" data-label="DESIGN NOTE">
            DESIGN NOTE
          </span>
          <span id="design-note-heading" className="eyebrow">
            Reasoning
          </span>
        </p>
        <p className="mt-3 max-w-[62ch] text-sm text-paper-dim">{DESIGN_NOTE}</p>
      </section>

      <p className="max-w-[62ch] text-xs text-ash">
        Read-only: there is no wallet, no key and no write function in this build. A number is only as
        good as its label and the block beside it.
      </p>
    </section>
  );
}
