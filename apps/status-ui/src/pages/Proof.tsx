import type { ReactNode } from "react";
import { useMode } from "../app/app-context";
import { BlockLink } from "../components/BlockLink";
import { useEvidence } from "../data/evidence-context";
import { formatCount, formatNative, formatWeiAsNative, type Label } from "../data/labels";
import { useLiveDeployment, type LiveOptions } from "../data/use-live";

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
        {unit ? <span className="text-ash"> {unit}</span> : null}
        {detail ? <p className="mono mt-1 break-words text-xs text-ash-2">{detail}</p> : null}
      </td>
      <td>
        <Chip label={label} />
      </td>
      <td className="mono break-words text-xs text-ash-2">{source}</td>
    </tr>
  );
}

/** The slash, in plain words, with every number tied to the evidence or to a live read. */
export function Proof(options: LiveOptions) {
  const mode = useMode();
  const evidence = useEvidence();
  const bundle = evidence.bundle;
  const live = useLiveDeployment(mode, {
    ...options,
    providerAddress: bundle?.providers[0]?.address ?? null,
    dealIds: [],
  });

  const slash = bundle?.rounds.find((round) => round.status === "failed") ?? null;
  const resolveTx = bundle?.transactions.find((tx) => tx.id === "resolve-2b") ?? null;
  const before = slash ? BigInt(slash.bondBeforeUnits) : null;
  const after = slash ? BigInt(slash.bondAfterUnits) : null;
  const cut = slash ? BigInt(slash.slashUnits) : null;
  const creditWei = slash ? BigInt(slash.ownerCreditWei) : null;
  const bps = before !== null && cut !== null && before > 0n ? (cut * 10_000n) / before : null;
  const percent = bps === null ? null : Number(bps) / 100;
  const evidenceId = bundle?.id ?? "portaldot-live-run2";
  const recordedSource = `evidence/${evidenceId}.json`;
  const liveSource = `chain ${bundle?.chain.chainId ?? mode.expectedChainId} @ block ${formatCount(live.block ?? 0)} · ${live.at}`;

  return (
    <section className="space-y-10">
      <header>
        <p className="eyebrow">04 / proof</p>
        <h1 className="mt-2 text-xl">The slash, in plain words</h1>
        <p className="mt-3 max-w-[62ch] text-paper-dim">
          Provider 1 posted a 30 tPOT bond. One challenge on deal 2 was left unanswered. When the
          deadline passed, resolve cut the bond by exactly 20% and paid the owner the same amount. No
          other slash exists on this deployment.
        </p>
      </header>

      <section aria-labelledby="before-after">
        <h2 id="before-after" className="eyebrow">
          Before and after
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[34%]" />
            </colgroup>
            <caption>
              Bond before, the cut, the bond after, and what the owner received — all from the recorded
              resolve.
            </caption>
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
                field="Bond before"
                value={before === null ? "not recorded" : formatNative(slash!.bondBeforeUnits)}
                unit="tPOT"
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Slash"
                value={cut === null ? "not recorded" : formatNative(slash!.slashUnits)}
                unit="tPOT"
                detail={percent === null ? undefined : `exactly ${percent}% of the bond`}
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Bond after"
                value={after === null ? "not recorded" : formatNative(slash!.bondAfterUnits)}
                unit="tPOT"
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Owner credited"
                value={creditWei === null ? "not recorded" : formatWeiAsNative(slash!.ownerCreditWei)}
                unit="tPOT"
                detail="balances before and after resolve, gas fee removed"
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Challenge block"
                value={<BlockLink block={slash?.startBlock} />}
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Deadline"
                value={slash ? formatCount(slash.deadline) : "not recorded"}
                label="REPORTED"
                source={recordedSource}
              />
              <Row
                field="Resolve block"
                value={<BlockLink block={resolveTx?.block} />}
                detail={resolveTx?.hash ?? slash?.resolveTx ?? undefined}
                label="REPORTED"
                source={recordedSource}
              />
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[62ch] text-sm text-paper-dim">
          {before !== null && after !== null && cut !== null && percent !== null
            ? `The bond went from ${formatNative(slash!.bondBeforeUnits)} tPOT to ${formatNative(slash!.bondAfterUnits)} tPOT. That is exactly ${percent}% — ${formatNative(slash!.slashUnits)} tPOT — and the owner was credited exactly ${formatNative(slash!.slashUnits)} tPOT.`
            : "The recorded resolve is missing from the evidence; nothing is claimed here."}
        </p>
      </section>

      <section aria-labelledby="proof-live-heading">
        <h2 id="proof-live-heading" className="eyebrow">
          What the chain holds now
        </h2>
        <div
          className="mt-3 overflow-x-auto"
          data-testid={live.status === "live" ? "proof-live" : undefined}
        >
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[34%]" />
            </colgroup>
            <caption>The bond is read from providerOf(provider 1) on every refresh.</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Value</th>
                <th scope="col">Label</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {live.provider ? (
                <Row
                  field="Provider 1 bond now"
                  value={formatNative(live.provider.bondUnits)}
                  unit="tPOT"
                  label="MEASURED"
                  source={liveSource}
                />
              ) : (
                <tr>
                  <td colSpan={4} className="text-ash">
                    No live read has answered yet; the recorded bond is shown above and nothing here is
                    claimed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="eyebrow">
          What this proves, and what it does not
        </h2>
        <ul className="mt-3 max-w-[62ch] list-disc space-y-2 pl-5 text-sm text-paper-dim">
          <li>
            The slash is arithmetic the contract enforces: 20% of the bond, paid to the owner. The
            recorded resolve shows both the bond change and the owner credit.
          </li>
          <li>
            It does not prove the provider was offline: the challenge was left unanswered on purpose,
            with the daemon paused, to exercise the path.
          </li>
          <li>
            No EVM explorer is configured for this network, so the proof is the receipt files and the
            live read. Block numbers open in the Portaldot node console; a transaction hash has no page
            to open, so it stays backed by its receipt file.
          </li>
        </ul>
        <p className="mt-4 text-xs text-ash">
          Read-only: nothing on this page can move a bond or a balance.
        </p>
      </section>
    </section>
  );
}
