import { writeFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { getBurnerKey, loadConfig, REPO_ROOT } from "../config.ts";
import { candidateAAccountId32 } from "../keygen.ts";
import { formatTpot, formatWeiTpot, LiveBudget, sendBudgetedTransaction } from "../lib/budget.ts";
import { walletFor } from "../lib/evm.ts";
import { getEvmBalance, publicClientFor, waitForFinalized } from "../lib/evm.ts";
import { accountId32ToSs58, connectSubstrate, readProperties, systemAccount } from "../lib/substrate.ts";

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = publicClientFor(config.evmRpcUrl);
  const connection = await connectSubstrate(config.wsUrl);
  const account = privateKeyToAccount(getBurnerKey("provider-1") as Hex);
  const evm = account.address.toLowerCase() as `0x${string}`;
  const accountId32 = candidateAAccountId32(account.address);
  const properties = await readProperties(connection.api);
  const ss58 = accountId32ToSs58(accountId32, properties.ss58Prefix);
  const nativeBefore = await systemAccount(connection.api, ss58);
  const evmBefore = await getEvmBalance(client, evm);
  const budget = await LiveBudget.load(client, evm);
  const valueWei = 1_000_000_000_000_000n; // 0.001 tPOT self-transfer
  const transfer = await sendBudgetedTransaction(
    walletFor(config.evmRpcUrl, getBurnerKey("provider-1") as Hex).wallet,
    client,
    budget,
    "provider-1 spend proof (0.001 tPOT self-transfer)",
    { to: evm, value: valueWei },
  );
  const finality = await waitForFinalized(client, transfer.receipt.blockNumber);
  const evmAfter = await getEvmBalance(client, evm);
  const nativeAfter = await systemAccount(connection.api, ss58);
  const feeWei = evmBefore > evmAfter ? evmBefore - evmAfter : 0n;
  const nativeFee = BigInt(nativeBefore.free) > BigInt(nativeAfter.free)
    ? BigInt(nativeBefore.free) - BigInt(nativeAfter.free)
    : 0n;
  const summary = {
    at: stamp(new Date()),
    provider_ss58: ss58,
    provider_evm: evm,
    provider_account_id32: accountId32,
    tx_hash: transfer.hash,
    status: transfer.receipt.status,
    block_number: Number(transfer.receipt.blockNumber),
    finalized_number: finality.finalizedNumber.toString(),
    finalized_hash: finality.finalizedHash,
    value_wei: valueWei.toString(),
    value_tpot: formatWeiTpot(valueWei),
    native_before_planck: nativeBefore.free,
    native_after_planck: nativeAfter.free,
    native_fee_planck: nativeFee.toString(),
    native_fee_tpot: formatTpot(nativeFee),
    evm_before_wei: evmBefore.toString(),
    evm_after_wei: evmAfter.toString(),
    evm_fee_wei: feeWei.toString(),
    evm_fee_tpot: formatWeiTpot(feeWei),
    spend_ok: feeWei > 0n && evmAfter === evmBefore - feeWei,
    budget_cumulative_tpot: formatWeiTpot(budget.spent),
    receipt: transfer.receipt,
  };
  const path = `${REPO_ROOT}/evidence/raw/g07/19-provider1-spend.json`;
  await writeFile(path, `${JSON.stringify(summary, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
  console.log(`provider1 tx=${transfer.hash} status=${transfer.receipt.status} finalized=${finality.finalizedNumber}`);
  console.log(`native_fee_tpot=${summary.native_fee_tpot} evm_fee_tpot=${summary.evm_fee_tpot} spend_ok=${summary.spend_ok}`);
  console.log(`evidence=${path}`);
  await connection.disconnect();
  if (!summary.spend_ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
