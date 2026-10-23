import { writeFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { getBurnerKey, loadConfig, REPO_ROOT } from "../config.ts";
import { candidateAAccountId32 } from "../keygen.ts";
import { LiveBudget, sendBudgetedTransaction, formatTpot, formatWeiTpot } from "../lib/budget.ts";
import { getEvmBalance, publicClientFor, waitForFinalized } from "../lib/evm.ts";
import { walletForMode } from "../lib/accounts.ts";
import { accountId32ToSs58, connectSubstrate, readProperties, systemAccount } from "../lib/substrate.ts";

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function ownerAccount() {
  const account = privateKeyToAccount(getBurnerKey("owner") as Hex);
  return {
    evm: account.address.toLowerCase() as `0x${string}`,
    accountId32: candidateAAccountId32(account.address),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = publicClientFor(config.evmRpcUrl);
  const connection = await connectSubstrate(config.wsUrl);
  const owner = ownerAccount();
  const properties = await readProperties(connection.api);
  const ownerSs58 = accountId32ToSs58(owner.accountId32, properties.ss58Prefix);

  const runtimeAccount = await (connection.api.call as unknown as {
    reviveApi: { accountId: (address: string) => Promise<{ toHex: () => string }> };
  }).reviveApi.accountId(owner.evm);
  const observedAccountId = runtimeAccount.toHex().toLowerCase();
  const mappingEqual = observedAccountId === owner.accountId32.toLowerCase();

  const [latest, finalized] = await Promise.all([
    connection.api.rpc.chain.getHeader(),
    connection.api.rpc.chain.getFinalizedHead().then((hash) => connection.api.rpc.chain.getHeader(hash)),
  ]);
  const nativeBefore = await systemAccount(connection.api, ownerSs58);
  const evmBefore = await getEvmBalance(client, owner.evm);
  const startedAt = stamp(new Date());

  if (nativeBefore.free === "0" && evmBefore === 0n) {
    throw new Error("owner is still unfunded; T023/T024 must not run");
  }
  if (!mappingEqual) {
    throw new Error(`ReviveApi_account_id differs from candidate A: ${observedAccountId}`);
  }

  const fundingLines = [
    `# T023 owner funding record`,
    `at=${startedAt}`,
    `spec=${connection.api.runtimeVersion.specName} version=${connection.api.runtimeVersion.specVersion}`,
    `genesis=${connection.api.genesisHash.toHex()}`,
    `ss58_prefix=${properties.ss58Prefix}`,
    `owner_ss58=${ownerSs58}`,
    `owner_evm=${owner.evm}`,
    `owner_account_id32=${owner.accountId32}`,
    `runtime_account_id=${observedAccountId}`,
    `mapping_equal=${mappingEqual}`,
    `native_free_planck=${nativeBefore.free}`,
    `native_free_tpot=${formatTpot(BigInt(nativeBefore.free))}`,
    `native_reserved_planck=${nativeBefore.reserved}`,
    `native_frozen_planck=${nativeBefore.frozen}`,
    `evm_balance_wei=${evmBefore}`,
    `evm_balance_tpot=${formatWeiTpot(evmBefore)}`,
    `latest_block=${latest.number.toString()} hash=${latest.hash.toHex()}`,
    `finalized_block=${finalized.number.toString()} hash=${finalized.hash.toHex()}`,
    `funding_source=[reported] human transfer from HUB1; no key or seed was read by this task`,
    ``,
  ];

  const budget = await LiveBudget.load(client, owner.evm);
  const ownerWallet = await walletForMode("live", config.evmRpcUrl);
  const valueWei = 1_000_000_000_000_000n; // 0.001 tPOT
  const transfer = await sendBudgetedTransaction(
    ownerWallet,
    client,
    budget,
    "T024 owner -> owner self value transfer (0.001 tPOT)",
    { to: owner.evm, value: valueWei },
  );
  const finality = await waitForFinalized(client, transfer.receipt.blockNumber);
  const evmAfter = await getEvmBalance(client, owner.evm);
  const nativeAfter = await systemAccount(connection.api, ownerSs58);
  const finishedAt = stamp(new Date());
  const evmFeeWei = evmBefore > evmAfter ? evmBefore - evmAfter : 0n;
  const nativeFeePlanck = BigInt(nativeBefore.free) > BigInt(nativeAfter.free)
    ? BigInt(nativeBefore.free) - BigInt(nativeAfter.free)
    : 0n;

  const t024 = {
    at: finishedAt,
    tx_hash: transfer.hash,
    from: owner.evm,
    to: owner.evm,
    value_wei: valueWei.toString(),
    value_tpot: formatWeiTpot(valueWei),
    self_transfer: true,
    status: transfer.receipt.status,
    block_number: Number(transfer.receipt.blockNumber),
    gas_used: transfer.receipt.gasUsed.toString(),
    finalized_number: finality.finalizedNumber.toString(),
    finalized_hash: finality.finalizedHash,
    latest_number: finality.latestNumber.toString(),
    owner_evm_before_wei: evmBefore.toString(),
    owner_evm_after_wei: evmAfter.toString(),
    owner_native_before_planck: nativeBefore.free,
    owner_native_after_planck: nativeAfter.free,
    owner_native_before_tpot: formatTpot(BigInt(nativeBefore.free)),
    owner_native_after_tpot: formatTpot(BigInt(nativeAfter.free)),
    fee_wei: evmFeeWei.toString(),
    fee_tpot: formatWeiTpot(evmFeeWei),
    native_fee_planck: nativeFeePlanck.toString(),
    native_fee_tpot: formatTpot(nativeFeePlanck),
    value_readback_ok: evmAfter === evmBefore - evmFeeWei,
    mapping_equal: mappingEqual,
    budget_spent_wei: budget.spent.toString(),
    budget_spent_tpot: formatWeiTpot(budget.spent),
    receipt: transfer.receipt,
  };

  const fundingPath = `${REPO_ROOT}/evidence/raw/g07/01-owner-funding.txt`;
  const transferPath = `${REPO_ROOT}/evidence/raw/g07/04-t024-transfer.json`;
  await writeFile(
    fundingPath,
    `${fundingLines.join("\n")}# T024 candidate-A spend test\n${JSON.stringify(
      t024,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    )}\n`,
  );
  await writeFile(
    transferPath,
    `${JSON.stringify(t024, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`,
  );

  console.log(fundingLines.join("\n"));
  console.log(`T024 tx=${transfer.hash} status=${transfer.receipt.status} finalized=${finality.finalizedNumber} value_readback_ok=${t024.value_readback_ok}`);
  console.log(`owner_native_after_tpot=${t024.owner_native_after_tpot} owner_evm_after_tpot=${formatWeiTpot(evmAfter)} budget_spent_tpot=${t024.budget_spent_tpot}`);
  console.log(`evidence=${fundingPath}`);
  console.log(`evidence=${transferPath}`);
  await connection.disconnect();
  if (!t024.value_readback_ok || t024.fee_wei === "0") process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
