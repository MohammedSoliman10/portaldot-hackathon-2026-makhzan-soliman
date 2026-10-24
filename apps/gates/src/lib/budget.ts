import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  encodeFunctionData,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { REPO_ROOT } from "../config.ts";

/** DR-011 live caps. Values are native planck. */
export const PLANCK_PER_TPOT = 10n ** 14n;
export const WEI_PER_TPOT = 10n ** 18n; // [assumption] nativeToEthRatio = 10000
export const NATIVE_TO_ETH_RATIO = 10_000n;
export const TOTAL_CAP_PLANCK = 100n * PLANCK_PER_TPOT;
export const SINGLE_CAP_PLANCK = 60n * PLANCK_PER_TPOT;
export const TOTAL_CAP_WEI = TOTAL_CAP_PLANCK * NATIVE_TO_ETH_RATIO;
export const SINGLE_CAP_WEI = SINGLE_CAP_PLANCK * NATIVE_TO_ETH_RATIO;
export const BUDGET_STATE_PATH = `${REPO_ROOT}/evidence/raw/g07/12-live-budget.json`;

export function formatTpot(planck: bigint): string {
  const negative = planck < 0n;
  const value = negative ? -planck : planck;
  const whole = value / PLANCK_PER_TPOT;
  const fraction = (value % PLANCK_PER_TPOT).toString().padStart(14, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function planckToTpot(planck: bigint): string {
  return formatTpot(planck);
}

export function weiToPlanck(wei: bigint): bigint {
  return wei / NATIVE_TO_ETH_RATIO;
}

export function formatWeiTpot(wei: bigint): string {
  return formatTpot(weiToPlanck(wei));
}

/** Throw before a live transaction if either DR-011 cap would break. */
export function assertCaps(estimateWei: bigint, spentWei: bigint): void {
  if (estimateWei > SINGLE_CAP_WEI) {
    throw new Error(
      `DR-011 single deposit cap: estimate ${formatWeiTpot(estimateWei)} tPOT exceeds ${formatTpot(SINGLE_CAP_PLANCK)} tPOT`,
    );
  }
  if (spentWei + estimateWei > TOTAL_CAP_WEI) {
    throw new Error(
      `DR-011 total cap: spent ${formatWeiTpot(spentWei)} + estimate ${formatWeiTpot(estimateWei)} exceeds ${formatTpot(TOTAL_CAP_PLANCK)} tPOT`,
    );
  }
}

export interface SpendTicket {
  label: string;
  gas: bigint;
  gasPriceWei: bigint;
  estimateWei: bigint;
  estimateTpot: string;
  balanceBeforeWei: bigint;
  valueWei: bigint;
}

export interface SpendEntry extends SpendTicket {
  hash: Hash;
  balanceAfterWei: bigint;
  spentWei: bigint;
  spentTpot: string;
  cumulativeWei: string;
  cumulativeTpot: string;
  at: string;
}

interface BudgetState {
  spentWei: string;
  entries: SpendEntry[];
}

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * File-backed live budget. G01, G02 and T026 run as separate processes, so the
 * cumulative spend has to survive between them.
 */
export class LiveBudget {
  private spentWei: bigint;
  readonly entries: SpendEntry[];
  private readonly client: PublicClient;
  private readonly account: Address;
  private readonly statePath: string;

  private constructor(
    client: PublicClient,
    account: Address,
    statePath: string,
    state: BudgetState,
  ) {
    this.client = client;
    this.account = account;
    this.statePath = statePath;
    this.spentWei = BigInt(state.spentWei);
    this.entries = state.entries;
  }

  static async load(client: PublicClient, account: Address, statePath = BUDGET_STATE_PATH): Promise<LiveBudget> {
    let state: BudgetState = { spentWei: "0", entries: [] };
    try {
      state = JSON.parse(await readFile(statePath, "utf8")) as BudgetState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return new LiveBudget(client, account, statePath, state);
  }

  get spent(): bigint {
    return this.spentWei;
  }

  /** Estimate, print, and refuse before sending when a DR-011 cap would break. */
  async preflight(
    label: string,
    request: { to?: Address | null; data?: Hex; value?: bigint; gas?: bigint },
  ): Promise<SpendTicket> {
    const valueWei = request.value ?? 0n;
    const gas =
      request.gas ??
      (await this.client.estimateGas({
        account: this.account,
        to: request.to ?? undefined,
        data: request.data,
        value: valueWei,
      }));
    const gasPriceWei = await this.client.getGasPrice();
    const estimateWei = gas * gasPriceWei + valueWei;
    assertCaps(estimateWei, this.spentWei);
    const balanceBeforeWei = await this.client.getBalance({ address: this.account });
    if (balanceBeforeWei < estimateWei) {
      throw new Error(
        `DR-011 balance guard: ${formatWeiTpot(balanceBeforeWei)} tPOT available, estimate ${formatWeiTpot(estimateWei)} tPOT`,
      );
    }
    const ticket: SpendTicket = {
      label,
      gas,
      gasPriceWei,
      estimateWei,
      estimateTpot: formatWeiTpot(estimateWei),
      balanceBeforeWei,
      valueWei,
    };
    console.log(
      `[DR-011] ${label} estimate_gas=${gas} gas_price_wei=${gasPriceWei} estimate_wei=${estimateWei} estimate_tpot=${ticket.estimateTpot} spent_tpot=${formatWeiTpot(this.spentWei)}`,
    );
    return ticket;
  }

  /** Record the actual balance delta and persist the cumulative spend. */
  async record(ticket: SpendTicket, hash: Hash): Promise<SpendEntry> {
    const balanceAfterWei = await this.client.getBalance({ address: this.account });
    const spentWei = ticket.balanceBeforeWei > balanceAfterWei ? ticket.balanceBeforeWei - balanceAfterWei : 0n;
    this.spentWei += spentWei;
    const entry: SpendEntry = {
      ...ticket,
      hash,
      balanceAfterWei,
      spentWei,
      spentTpot: formatWeiTpot(spentWei),
      cumulativeWei: this.spentWei.toString(),
      cumulativeTpot: formatWeiTpot(this.spentWei),
      at: stamp(new Date()),
    };
    this.entries.push(entry);
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(
      this.statePath,
      `${JSON.stringify(
        { spentWei: this.spentWei.toString(), spentTpot: formatWeiTpot(this.spentWei), entries: this.entries },
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      )}\n`,
    );
    console.log(
      `[DR-011] ${ticket.label} tx=${hash} spent_tpot=${entry.spentTpot} cumulative_tpot=${entry.cumulativeTpot}`,
    );
    if (this.spentWei > TOTAL_CAP_WEI) {
      throw new Error(`DR-011 total cap exceeded after ${hash}: ${formatWeiTpot(this.spentWei)} tPOT`);
    }
    return entry;
  }
}

export async function sendBudgetedTransaction(
  wallet: WalletClient,
  client: PublicClient,
  budget: LiveBudget,
  label: string,
  request: { to?: Address | null; data?: Hex; value?: bigint },
): Promise<{ hash: Hash; receipt: TransactionReceipt }> {
  if (!wallet.account) throw new Error("wallet has no account");
  const ticket = await budget.preflight(label, request);
  const hash = await wallet.sendTransaction({
    account: wallet.account,
    chain: wallet.chain,
    to: request.to ?? undefined,
    data: request.data,
    value: request.value,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  await budget.record(ticket, hash);
  return { hash, receipt };
}

export async function sendBudgetedContract(
  wallet: WalletClient,
  client: PublicClient,
  budget: LiveBudget,
  label: string,
  request: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint },
): Promise<{ hash: Hash; receipt: TransactionReceipt }> {
  const data = encodeFunctionData({
    abi: request.abi,
    functionName: request.functionName,
    args: (request.args ?? []) as never,
  });
  return sendBudgetedTransaction(wallet, client, budget, label, {
    to: request.address,
    data,
    value: request.value,
  });
}
