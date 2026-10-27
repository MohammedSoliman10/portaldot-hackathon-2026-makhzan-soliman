/**
 * The recorded run, one step at a time.
 *
 * Every step is built from the evidence bundle — the transactions and the rounds — so the replay can
 * only say what the bundle recorded. It is a recording, not a re-execution: `/verify` re-checks a file
 * against the live root, and `/proof` reads the bond now.
 */
import { formatCount, formatNative, formatWei, formatWeiAsNative, type Label } from "./labels";
import type { EvidenceBundle, Hex, RoundInfo } from "./schema";

export type ReplayKind =
  | "create"
  | "challenge"
  | "answer"
  | "no-answer"
  | "resolve"
  | "claim"
  | "settle";

export interface ReplayStep {
  id: string;
  kind: ReplayKind;
  title: string;
  what: string;
  block: number;
  tx: Hex | null;
  label: Label;
  source: string;
}

export interface Replay {
  dealId: number;
  evidenceId: string;
  steps: ReplayStep[];
  slashed: boolean;
  bondBeforeUnits: string | null;
  bondAfterUnits: string | null;
  slashUnits: string | null;
  ownerCreditWei: string | null;
}

const shortHex = (value: Hex): string => `${value.slice(0, 10)}…${value.slice(-6)}`;

/** `challenge-1` for a single round, `challenge-2a` / `challenge-2b` when there are two. */
const roundSuffix = (dealId: number, index: number, total: number): string =>
  total === 1 ? `${dealId}` : `${dealId}${String.fromCharCode(97 + index)}`;

export function replayFor(bundle: EvidenceBundle | null, dealId: number): Replay | null {
  if (bundle === null) return null;
  const deal = bundle.deals.find((item) => item.id === dealId);
  if (deal === undefined) return null;

  const source = `evidence/${bundle.id}.json`;
  const txById = (id: string) => bundle.transactions.find((item) => item.id === id) ?? null;
  const rounds: RoundInfo[] = bundle.rounds.filter((round) => round.dealId === dealId);
  const steps: ReplayStep[] = [];

  const create = txById(`create-${dealId}`);
  steps.push({
    id: `create-${dealId}`,
    kind: "create",
    title: `Create deal ${dealId}`,
    what: `The owner committed the root ${shortHex(deal.root)} for ${formatCount(deal.size)} bytes in ${formatCount(deal.leafCount)} blocks, at ${formatNative(deal.priceUnits)} tPOT for ${formatCount(deal.endBlock - deal.startBlock)} blocks (${formatCount(deal.startBlock)} to ${formatCount(deal.endBlock)}).`,
    block: create?.block ?? deal.startBlock,
    tx: create?.hash ?? null,
    label: "REPORTED",
    source,
  });

  rounds.forEach((round, index) => {
    const suffix = roundSuffix(dealId, index, rounds.length);
    const challenge = txById(`challenge-${suffix}`);
    const answer = txById(`answer-${suffix}`);
    const resolve = txById(`resolve-${suffix}`);
    const position = rounds.length === 1 ? "" : ` ${index + 1} of ${rounds.length}`;

    steps.push({
      id: `challenge-${round.id}`,
      kind: "challenge",
      title: `Challenge${position}`,
      what: `The contract drew block ${formatCount(round.index)} from the root and set the deadline at ${formatCount(round.deadline)}.`,
      block: round.startBlock,
      tx: challenge?.hash ?? round.challengeTx,
      label: "REPORTED",
      source,
    });

    if (answer !== null || round.answerTx !== null) {
      const answeredAt = answer?.block ?? round.startBlock;
      const delta = answeredAt - round.startBlock;
      const when =
        delta === 0 ? "in the same block" : delta === 1 ? "one block later" : `${formatCount(delta)} blocks later`;
      steps.push({
        id: `answer-${round.id}`,
        kind: "answer",
        title: `Answered${position}`,
        what: `The provider answered ${when}, with block ${formatCount(round.index)} and its path. The proof verified, so the bond did not move.`,
        block: answeredAt,
        tx: answer?.hash ?? round.answerTx,
        label: "REPORTED",
        source,
      });
    } else {
      steps.push({
        id: `no-answer-${round.id}`,
        kind: "no-answer",
        title: "No answer before the deadline",
        what: `No answer arrived before block ${formatCount(round.deadline)}. The challenge stayed open until the deadline passed, and the bond was still ${formatNative(round.bondBeforeUnits)} tPOT.`,
        block: round.deadline,
        tx: null,
        label: "REPORTED",
        source,
      });
    }

    if (round.outcome === "slashed") {
      const before = BigInt(round.bondBeforeUnits);
      const cut = BigInt(round.slashUnits);
      const bps = before > 0n ? (cut * 10_000n) / before : 0n;
      steps.push({
        id: `resolve-${round.id}`,
        kind: "resolve",
        title: "Resolve — the slash",
        what: `The owner resolved the missed challenge: the bond went from ${formatNative(round.bondBeforeUnits)} tPOT to ${formatNative(round.bondAfterUnits)} tPOT, a slash of exactly ${formatNative(round.slashUnits)} tPOT (${formatWei(round.slashUnits)} units, ${Number(bps) / 100}% of the bond), credited to the owner as ${formatWeiAsNative(round.ownerCreditWei)} tPOT (${formatWei(round.ownerCreditWei)} wei).`,
        block: resolve?.block ?? round.deadline,
        tx: resolve?.hash ?? round.resolveTx,
        label: "REPORTED",
        source,
      });
    }
  });

  const claim = txById(`claim-${dealId}`);
  if (claim !== null) {
    steps.push({
      id: `claim-${dealId}`,
      kind: "claim",
      title: "Claim",
      what: `The provider claimed ${formatNative(deal.claimedUnits)} tPOT after the deal's end block (${formatCount(deal.endBlock)}).`,
      block: claim.block ?? deal.endBlock,
      tx: claim.hash,
      label: "REPORTED",
      source,
    });
  }

  const settle = txById(`settle-${dealId}`);
  if (settle !== null) {
    steps.push({
      id: `settle-${dealId}`,
      kind: "settle",
      title: "Settle",
      what: `The deal settled: the remaining bond was released and the deal reads health 0 — settled, not a fault.`,
      block: settle.block ?? deal.endBlock,
      tx: settle.hash,
      label: "REPORTED",
      source,
    });
  }

  const slashed = rounds.find((round) => round.outcome === "slashed") ?? null;
  return {
    dealId,
    evidenceId: bundle.id,
    steps,
    slashed: slashed !== null,
    bondBeforeUnits: slashed?.bondBeforeUnits ?? rounds[0]?.bondBeforeUnits ?? null,
    bondAfterUnits: slashed?.bondAfterUnits ?? rounds[rounds.length - 1]?.bondAfterUnits ?? null,
    slashUnits: slashed?.slashUnits ?? null,
    ownerCreditWei: slashed?.ownerCreditWei ?? null,
  };
}
