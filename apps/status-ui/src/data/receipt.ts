/**
 * One deal, read back as a receipt.
 *
 * Everything here comes from the recorded evidence bundle, so every number is REPORTED and names its
 * source. Nothing is fetched: a receipt is a record of what the chain did, not a live read. The live
 * bond and health belong to the deal page and to /proof.
 */
import type { DealState, EvidenceBundle, Hex, RoundOutcome, TransactionInfo } from "./schema";
import { formatCount, formatNative, formatWei, formatWeiAsNative, type Label } from "./labels";

export interface ReceiptTransaction {
  id: string;
  label: string;
  hash: Hex | null;
  block: number | null;
}

export interface ReceiptRound {
  id: number;
  index: number;
  outcome: RoundOutcome;
  startBlock: number;
  deadline: number;
  challengeTx: Hex | null;
  answerTx: Hex | null;
  resolveTx: Hex | null;
  bondBeforeUnits: string;
  bondAfterUnits: string;
  slashUnits: string;
  ownerCreditWei: string;
  note: string;
}

export interface Receipt {
  dealId: number;
  evidenceId: string;
  owner: Hex;
  providerId: number;
  root: Hex;
  leafCount: number;
  size: number;
  blockSize: number;
  startBlock: number;
  endBlock: number;
  priceUnits: string;
  claimedUnits: string;
  state: DealState;
  health: 0 | 1 | 2 | 3 | null;
  /** The bond the first recorded round started from, and the bond the last one left. */
  bondBeforeUnits: string;
  bondAfterUnits: string;
  /** Sum of every recorded slash on this deal, in native units. */
  slashUnits: string;
  /** Sum of every recorded owner credit on this deal, in wei. */
  ownerCreditWei: string;
  slashPercent: number | null;
  rounds: readonly ReceiptRound[];
  slashedRound: ReceiptRound | null;
  transactions: readonly ReceiptTransaction[];
}

export interface ReceiptRow {
  field: string;
  value: string;
  unit?: string;
  detail?: string;
  label: Label;
  source: string;
}

const sum = (values: readonly string[]): bigint =>
  values.reduce((total, value) => total + BigInt(value), 0n);

/** `settle-2`, `challenge-2a`, `resolve-2b` belong to deal 2; `deploy` and `register` belong to none. */
const belongsToDeal = (id: string, dealId: number): boolean =>
  new RegExp(`-${dealId}[ab]?$`).test(id);

export function receiptFor(bundle: EvidenceBundle | null, dealId: number): Receipt | null {
  if (bundle === null) return null;
  const deal = bundle.deals.find((item) => item.id === dealId);
  if (deal === undefined) return null;

  const rounds: ReceiptRound[] = bundle.rounds
    .filter((round) => round.dealId === dealId)
    .map((round) => ({
      id: round.id,
      index: round.index,
      outcome: round.outcome,
      startBlock: round.startBlock,
      deadline: round.deadline,
      challengeTx: round.challengeTx,
      answerTx: round.answerTx,
      resolveTx: round.resolveTx,
      bondBeforeUnits: round.bondBeforeUnits,
      bondAfterUnits: round.bondAfterUnits,
      slashUnits: round.slashUnits,
      ownerCreditWei: round.ownerCreditWei,
      note: round.note,
    }));

  const first = rounds[0] ?? null;
  const last = rounds[rounds.length - 1] ?? null;
  const slashUnits = sum(rounds.map((round) => round.slashUnits)).toString();
  const ownerCreditWei = sum(rounds.map((round) => round.ownerCreditWei)).toString();
  const before = first === null ? null : BigInt(first.bondBeforeUnits);
  const cut = BigInt(slashUnits);
  const bps = before !== null && before > 0n ? (cut * 10_000n) / before : null;

  const transactions: ReceiptTransaction[] = bundle.transactions
    .filter((tx: TransactionInfo) => belongsToDeal(tx.id, dealId))
    .map((tx) => ({ id: tx.id, label: tx.label, hash: tx.hash, block: tx.block }));

  return {
    dealId,
    evidenceId: bundle.id,
    owner: deal.owner,
    providerId: deal.providerId,
    root: deal.root,
    leafCount: deal.leafCount,
    size: deal.size,
    blockSize: deal.blockSize,
    startBlock: deal.startBlock,
    endBlock: deal.endBlock,
    priceUnits: deal.priceUnits,
    claimedUnits: deal.claimedUnits,
    state: deal.state,
    health: deal.health,
    bondBeforeUnits: first === null ? "" : first.bondBeforeUnits,
    bondAfterUnits: last === null ? "" : last.bondAfterUnits,
    slashUnits,
    ownerCreditWei,
    slashPercent: bps === null ? null : Number(bps) / 100,
    rounds,
    slashedRound: rounds.find((round) => round.outcome === "slashed") ?? null,
    transactions,
  };
}

/** The share link. A hash route needs no rewrite, so it works on any static host. */
export function receiptLink(origin: string, dealId: number): string {
  return `${origin.replace(/\/+$/, "")}/#/receipt/${dealId}`;
}

/**
 * Where a transaction hash should point. There is no explorer on this network, so the hash links to
 * the evidence file that records it, and the page says so in words.
 */
export function transactionHref(bundle: EvidenceBundle, hash: Hex): string {
  const explorer = bundle.chain.explorer;
  if (explorer !== null && explorer.trim() !== "") {
    return `${explorer.replace(/\/+$/, "")}/tx/${hash}`;
  }
  return `/evidence/${bundle.id}.json`;
}

/** The four numbers the receipt exists for, plus the round that produced the slash. */
export function receiptRows(receipt: Receipt): ReceiptRow[] {
  const source = `evidence/${receipt.evidenceId}.json`;
  const slash = receipt.slashedRound;
  const hasRounds = receipt.rounds.length > 0;
  const rows: ReceiptRow[] = [
    {
      field: "Bond before",
      value: hasRounds ? formatNative(receipt.bondBeforeUnits) : "not recorded",
      unit: hasRounds ? "tPOT" : undefined,
      label: "REPORTED",
      source,
    },
    {
      field: "Slash",
      value: formatNative(receipt.slashUnits),
      unit: "tPOT",
      detail:
        receipt.slashUnits === "0"
          ? "no slash was recorded on this deal"
          : `${formatWei(receipt.slashUnits)} units` +
            (receipt.slashPercent === null ? "" : ` · exactly ${receipt.slashPercent}% of the bond`),
      label: "REPORTED",
      source,
    },
    {
      field: "Bond after",
      value: hasRounds ? formatNative(receipt.bondAfterUnits) : "not recorded",
      unit: hasRounds ? "tPOT" : undefined,
      label: "REPORTED",
      source,
    },
    {
      field: "Owner credited",
      value: formatWeiAsNative(receipt.ownerCreditWei),
      unit: "tPOT",
      detail:
        receipt.ownerCreditWei === "0"
          ? "no credit was recorded on this deal"
          : `${formatWei(receipt.ownerCreditWei)} wei`,
      label: "REPORTED",
      source,
    },
  ];

  if (slash !== null) {
    const resolveBlock = resolveBlockOf(receipt, slash);
    rows.push(
      {
        field: "Slashed round index",
        value: formatCount(slash.index),
        label: "REPORTED",
        source,
      },
      {
        field: "Challenge block",
        value: formatCount(slash.startBlock),
        label: "REPORTED",
        source,
      },
      { field: "Deadline", value: formatCount(slash.deadline), label: "REPORTED", source },
      {
        field: "Resolve block",
        value: resolveBlock === null ? "not recorded" : formatCount(resolveBlock),
        detail: slash.resolveTx ?? undefined,
        label: "REPORTED",
        source,
      },
    );
  }

  return rows;
}

/** The block the resolve landed in, taken from the transaction that carries the same hash. */
function resolveBlockOf(receipt: Receipt, slash: ReceiptRound): number | null {
  if (slash.resolveTx === null) return null;
  const tx = receipt.transactions.find((item) => item.hash === slash.resolveTx);
  return tx?.block ?? null;
}
