/**
 * `makhzan_deal_story(dealId)`: the deal's history rebuilt from its events, plus the same PASS/FAIL
 * checks the CLI prints (`apps/makhzan/src/dealVerify.ts`), so the agent and the operator cannot
 * disagree about a deal.
 *
 * The event decoding is not re-implemented: `StorySource` is the CLI's `fetchDealVerifyInput`, which
 * reads state and logs and records a refused log range as `logsError` instead of guessing. A missing
 * history is printed as INCOMPLETE, never as PASS.
 */
import { formatCount, formatTpot } from "../format.ts";
import type { ToolResult } from "../result.ts";
import { renderVerify, verifyDeal, type DealLog, type DealVerifyInput } from "../../../makhzan/src/dealVerify.ts";
import type { Hex } from "viem";

export interface StorySource {
  input(dealId: number): Promise<DealVerifyInput>;
}

function describe(log: DealLog): string {
  const head = `block ${log.block}  ${log.kind}`;
  switch (log.kind) {
    case "created":
      return `${head}  root ${log.root} size ${log.size} endBlock ${log.endBlock} price ${formatTpot(log.price ?? 0n)} tPOT`;
    case "opened":
      return `${head}  index ${log.index}, deadline ${log.deadline}`;
    case "failed":
      return `${head}  slash ${formatTpot(log.slash ?? 0n)} tPOT`;
    case "claimed":
      return `${head}  amount ${formatTpot(log.amount ?? 0n)} tPOT`;
    case "settled":
      return `${head}  toProvider ${formatTpot(log.toProvider ?? 0n)} tPOT, remainder ${formatTpot(log.remainder ?? 0n)} tPOT`;
    default:
      return head;
  }
}

export async function storyTool(
  source: StorySource,
  dealId: number,
  ctx: { contract: Hex },
): Promise<ToolResult> {
  const input = await source.input(dealId);
  const report = verifyDeal(input);
  const checks = renderVerify(report);

  const history = input.logs === null ? null : input.logs.slice().sort((a, b) => a.block - b.block);
  const historyLines =
    history === null
      ? [`history unavailable: ${input.logsError ?? "no logs returned and no reason given"}`]
      : history.length === 0
        ? ["history empty: the node returned no events for this deal"]
        : [
            `history (${history.length} events, blocks ${history[0]!.block}..${history[history.length - 1]!.block}, head ${input.latestBlock}):`,
            ...history.map((log) => `  ${describe(log)}`),
          ];

  const text = [
    `[MEASURED] makhzan_deal_story — deal ${dealId}`,
    `chain state read at block ${input.latestBlock}, Makhzan ${ctx.contract}`,
    ...historyLines,
    "checks:",
    ...checks,
    "label: MEASURED — every line comes from chain state or a decoded event, never from this server's own memory.",
  ].join("\n");

  return {
    text,
    facts: {
      label: "MEASURED",
      dealId,
      contract: ctx.contract,
      head: input.latestBlock,
      result: report.result,
      counts: report.counts,
      history:
        history === null
          ? null
          : history.map((log) => ({
              kind: log.kind,
              block: log.block,
              txHash: log.txHash,
              index: log.index ?? null,
              deadline: log.deadline ?? null,
            })),
      logsError: input.logsError,
      checks,
    },
  };
}
