/**
 * Read-only deal verification: turn on-chain state plus decoded events into PASS/FAIL lines.
 *
 * Nothing here talks to the network. The caller passes exactly what it read (or an explicit
 * `logsError` when the RPC refused a log range), so a missing history can never be reported as a
 * pass. Every claim in the output is traceable to one of the inputs.
 */
import type { Hex } from "viem";

export type LogKind = "created" | "opened" | "passed" | "failed" | "claimed" | "settled";

export interface DealLog {
  kind: LogKind;
  block: number;
  txHash: Hex;
  /** ChallengeOpened */
  index?: number;
  deadline?: number;
  /** ChallengeFailed */
  slash?: bigint;
  /** Claimed */
  amount?: bigint;
  /** Settled */
  toProvider?: bigint;
  remainder?: bigint;
  /** DealCreated */
  root?: Hex;
  size?: number;
  endBlock?: number;
  price?: bigint;
}

export interface DealView {
  owner: Hex;
  startBlock: number;
  endBlock: number;
  providerId: number;
  /** bit 0 = settled, bit 1 = challenge open (contract layout) */
  flags: number;
  root: Hex;
  leafCount: number;
  size: number;
  price: bigint;
  claimed: bigint;
}

export interface ProviderView {
  id: number;
  bond: bigint;
  activeDeals: number;
  registered: boolean;
}

export interface AccruedView {
  accrued: bigint;
  claimable: bigint;
}

export interface ChallengeView {
  open: boolean;
  index: number;
  start: number;
  deadline: number;
}

export interface DealVerifyInput {
  dealId: number;
  blockSize: number;
  latestBlock: number;
  deal: DealView;
  /** null when the provider could not be resolved; `providerError` then says why. */
  provider: ProviderView | null;
  providerError?: string | null;
  accrued: AccruedView;
  challenge: ChallengeView;
  health: number;
  logs: DealLog[] | null;
  logsError: string | null;
}

export type LineStatus = "PASS" | "FAIL" | "UNKNOWN" | "PENDING";

export interface VerifyLine {
  status: LineStatus;
  text: string;
}

export type VerifyResult = "PASS" | "FAIL" | "INCOMPLETE";

export interface VerifyReport {
  dealId: number;
  lines: VerifyLine[];
  result: VerifyResult;
  counts: { pass: number; fail: number; unknown: number; pending: number };
}

const zeroRoot = /^0x0{64}$/;

/** Expected `healthOf` given the stored state and the block being read. */
export function expectedHealth(input: Pick<DealVerifyInput, "deal" | "challenge" | "latestBlock">): number {
  if ((input.deal.flags & 1) === 1) return 0;
  if (input.challenge.open) return input.latestBlock > input.challenge.deadline ? 3 : 2;
  return 1;
}

function sorted(logs: DealLog[], kind: LogKind): DealLog[] {
  return logs
    .filter((log) => log.kind === kind)
    .slice()
    .sort((a, b) => a.block - b.block || (a.index ?? 0) - (b.index ?? 0));
}

/** Pairs each ChallengeOpened with the next passed/failed event, in event order. */
function pairResolutions(logs: DealLog[]): (DealLog | null)[] {
  const opened = sorted(logs, "opened");
  const resolutions = logs
    .filter((log) => log.kind === "passed" || log.kind === "failed")
    .slice()
    .sort((a, b) => a.block - b.block);
  let cursor = 0;
  return opened.map((open) => {
    while (cursor < resolutions.length && resolutions[cursor].block < open.block) cursor++;
    if (cursor >= resolutions.length) return null;
    return resolutions[cursor++];
  });
}

export function verifyDeal(input: DealVerifyInput): VerifyReport {
  const lines: VerifyLine[] = [];
  const add = (status: LineStatus, text: string) => lines.push({ status, text });
  const { deal, provider } = input;

  // 1. provider registered with a bond
  if (provider === null) {
    add("UNKNOWN", `provider ${deal.providerId} could not be read: ${input.providerError ?? "no reason given"}`);
  } else if (provider.id === 0 || !provider.registered) {
    add("FAIL", `provider ${deal.providerId} is not registered (id=${provider.id}, registered=${provider.registered})`);
  } else if (provider.bond === 0n) {
    add("FAIL", `provider ${provider.id} is registered with a zero bond`);
  } else {
    add(
      "PASS",
      `provider ${provider.id} registered with bond ${provider.bond} units, ${provider.activeDeals} active deal(s)`,
    );
  }

  // 2. deal opened with a root
  const expectedLeaves = Math.ceil(deal.size / input.blockSize);
  if (zeroRoot.test(deal.root) || deal.size === 0 || deal.price === 0n) {
    add("FAIL", `deal ${input.dealId} is not opened: root=${deal.root} size=${deal.size} price=${deal.price}`);
  } else if (deal.leafCount !== expectedLeaves) {
    add(
      "FAIL",
      `deal ${input.dealId} leafCount ${deal.leafCount} does not match ceil(size/${input.blockSize})=${expectedLeaves}`,
    );
  } else if (deal.endBlock < deal.startBlock) {
    add("FAIL", `deal ${input.dealId} ends at ${deal.endBlock}, before its start ${deal.startBlock}`);
  } else {
    add(
      "PASS",
      `deal ${input.dealId} opened with root ${deal.root}, size ${deal.size} B, ${deal.leafCount} leaves, ` +
        `price ${deal.price} units, blocks ${deal.startBlock}..${deal.endBlock}`,
    );
  }

  // 3/4. challenge history and its outcome
  if (input.logs === null) {
    add("UNKNOWN", `challenge history unavailable: ${input.logsError ?? "no logs returned and no reason given"}`);
  } else {
    const created = sorted(input.logs, "created");
    if (created.length === 0) {
      add("UNKNOWN", `DealCreated log for deal ${input.dealId} not returned; the creation event is unchecked`);
    } else {
      const log = created[0];
      const mismatches: string[] = [];
      if (log.block !== deal.startBlock) mismatches.push(`block ${log.block} != startBlock ${deal.startBlock}`);
      if ((log.root ?? "").toLowerCase() !== deal.root.toLowerCase()) mismatches.push(`root ${log.root} != ${deal.root}`);
      if (log.size !== deal.size) mismatches.push(`size ${log.size} != ${deal.size}`);
      if (log.endBlock !== deal.endBlock) mismatches.push(`endBlock ${log.endBlock} != ${deal.endBlock}`);
      if ((log.price ?? 0n) !== deal.price) mismatches.push(`price ${log.price} != ${deal.price}`);
      if (mismatches.length > 0) {
        add("FAIL", `DealCreated log does not match state: ${mismatches.join("; ")}`);
      } else {
        add(
          "PASS",
          `DealCreated at block ${log.block} (tx ${log.txHash}) matches root, size, endBlock and price`,
        );
      }
    }

    const opened = sorted(input.logs, "opened");
    const resolutions = pairResolutions(input.logs);
    if (opened.length === 0) {
      add("PASS", "no ChallengeOpened event: the client never challenged this deal");
    }
    opened.forEach((open, i) => {
      const n = i + 1;
      if ((open.index ?? -1) < 0 || (open.index ?? -1) >= deal.leafCount) {
        add("FAIL", `challenge #${n} index ${open.index} is outside 0..${deal.leafCount - 1}`);
      } else {
        add(
          "PASS",
          `challenge #${n} issued at block ${open.block} index ${open.index} deadline ${open.deadline} (tx ${open.txHash})`,
        );
      }
      const resolution = resolutions[i];
      if (resolution?.kind === "passed") {
        add("PASS", `challenge #${n} answered at block ${resolution.block} (tx ${resolution.txHash}); no bond movement in the event`);
      } else if (resolution?.kind === "failed") {
        add(
          "PASS",
          `challenge #${n} slashed at block ${resolution.block} (tx ${resolution.txHash}): ` +
            `${resolution.slash ?? 0n} units moved from the bond to the owner`,
        );
      } else if (input.latestBlock > (open.deadline ?? 0)) {
        add(
          "FAIL",
          `challenge #${n} unresolved: no ChallengePassed/ChallengeFailed event by block ${input.latestBlock}, deadline ${open.deadline}`,
        );
      } else {
        add(
          "PENDING",
          `challenge #${n} still inside its window: deadline ${open.deadline}, head ${input.latestBlock}`,
        );
      }
    });
  }

  // 5. claimed equals accrued
  const settled = (deal.flags & 1) === 1;
  if (settled) {
    if (deal.claimed !== input.accrued.accrued) {
      add("FAIL", `claimed ${deal.claimed} does not equal accrued ${input.accrued.accrued} after settle`);
    } else if (input.accrued.claimable !== 0n) {
      add("FAIL", `deal is settled but claimable is ${input.accrued.claimable}, not zero`);
    } else {
      add("PASS", `claimed ${deal.claimed} equals accrued ${input.accrued.accrued}; claimable is zero`);
    }
  } else if (deal.claimed > input.accrued.accrued) {
    add("FAIL", `claimed ${deal.claimed} exceeds accrued ${input.accrued.accrued}`);
  } else {
    add(
      "PASS",
      `deal is not settled; claimed ${deal.claimed} of accrued ${input.accrued.accrued}, claimable ${input.accrued.claimable}`,
    );
  }

  // 6. final health
  const expected = expectedHealth(input);
  if (input.health === expected) {
    add("PASS", `healthOf(${input.dealId}) = ${input.health} matches the stored state`);
  } else {
    add("FAIL", `healthOf(${input.dealId}) = ${input.health}, expected ${expected} from state and head ${input.latestBlock}`);
  }

  const counts = { pass: 0, fail: 0, unknown: 0, pending: 0 };
  for (const line of lines) {
    if (line.status === "PASS") counts.pass++;
    else if (line.status === "FAIL") counts.fail++;
    else if (line.status === "UNKNOWN") counts.unknown++;
    else counts.pending++;
  }
  const result: VerifyResult = counts.fail > 0 ? "FAIL" : counts.unknown > 0 || counts.pending > 0 ? "INCOMPLETE" : "PASS";
  return { dealId: input.dealId, lines, result, counts };
}

/** One line per check plus a final RESULT line; the CLI prints these verbatim. */
export function renderVerify(report: VerifyReport): string[] {
  const { counts } = report;
  return [
    ...report.lines.map((line) => `${line.status} ${line.text}`),
    `RESULT: ${report.result} (${counts.pass} pass, ${counts.fail} fail, ${counts.unknown} unknown, ${counts.pending} pending)`,
  ];
}
