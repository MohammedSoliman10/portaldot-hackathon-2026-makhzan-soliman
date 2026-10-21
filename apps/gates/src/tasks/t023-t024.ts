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
  const provider = {
    evm: "0xf4ec143c743ff57c0d32e829f50692551cbf6029" as `0x${string}`,
    accountId32: "0xf4ec143c743ff57c0d32e829f50692551cbf6029eeeeeeeeeeeeeeeeeeeeeeee",
  };
  const properties = await readProperties(connection.api);
  const ownerSs58 = accountId32ToSs58(owner.accountId32, properties.ss58Prefix);
  const providerSs58 = accountId32ToSs58(provider.accountId32, properties.ss58Prefix);

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
  const providerBefore = await getEvmBalance(client, provider.evm);
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
    `funding_source=human transfer from HUB2; no key or seed was read by this task`,
    ``,
  ];

  const budget = await LiveBudget.load(client, owner.evm);
  const ownerWallet = await walletForMode("live", config.evmRpcUrl);
  const transfer = await sendBudgetedTransaction(
    ownerWallet,
    client,
    budget,
    "T024 owner -> provider-1 value transfer (1 wei)",
    { to: provider.evm, value: 1n },
  );
  const finality = await waitForFinalized(client, transfer.receipt.blockNumber);
  const providerAfter = await getEvmBalance(client, provider.evm);
  const evmAfter = await getEvmBalance(client, owner.evm);
  const nativeAfter = await systemAccount(connection.api, ownerSs58);
  const finishedAt = stamp(new Date());

  const t024 = {
    at: finishedAt,
    tx_hash: transfer.hash,
    from: owner.evm,
    to: provider.evm,
    value_wei: "1",
    status: transfer.receipt.status,
    block_number: Number(transfer.receipt.blockNumber),
    gas_used: transfer.receipt.gasUsed.toString(),
    finalized_number: finality.finalizedNumber.toString(),
    finalized_hash: finality.finalizedHash,
    latest_number: finality.latestNumber.toString(),
    provider_balance_before_wei: providerBefore.toString(),
    provider_balance_after_wei: providerAfter.toString(),
    provider_readback_ok: providerAfter === providerBefore + 1n,
    owner_evm_before_wei: evmBefore.toString(),
    owner_evm_after_wei: evmAfter.toString(),
    owner_native_before_planck: nativeBefore.free,
    owner_native_after_planck: nativeAfter.free,
    owner_native_before_tpot: formatTpot(BigInt(nativeBefore.free)),
    owner_native_after_tpot: formatTpot(BigInt(nativeAfter.free)),
    mapping_equal: mappingEqual,
    provider_ss58: providerSs58,
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
  console.log(`T024 tx=${transfer.hash} status=${transfer.receipt.status} finalized=${finality.finalizedNumber} provider_readback_ok=${t024.provider_readback_ok}`);
  console.log(`owner_native_after_tpot=${t024.owner_native_after_tpot} owner_evm_after_tpot=${formatWeiTpot(evmAfter)} budget_spent_tpot=${t024.budget_spent_tpot}`);
  console.log(`evidence=${fundingPath}`);
  console.log(`evidence=${transferPath}`);
  await connection.disconnect();
  if (!t024.provider_readback_ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
