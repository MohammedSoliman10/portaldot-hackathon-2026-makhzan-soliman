import { writeFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { getBurnerKey, loadConfig, REPO_ROOT } from "../config.ts";
import { candidateAAccountId32 } from "../keygen.ts";
import { formatTpot, formatWeiTpot, LiveBudget, sendBudgetedContract, WEI_PER_TPOT } from "../lib/budget.ts";
import { loadArtifact } from "../lib/artifacts.ts";
import { walletForMode } from "../lib/accounts.ts";
import { deployProbe } from "../lib/deploy.ts";
import { getEvmBalance, publicClientFor, waitForFinalized } from "../lib/evm.ts";
import { accountId32ToSs58, connectSubstrate, readProperties, systemAccount } from "../lib/substrate.ts";
import { impliedFactor } from "../gates/g07.ts";

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = publicClientFor(config.evmRpcUrl);
  const connection = await connectSubstrate(config.wsUrl);
  const ownerAccount = privateKeyToAccount(getBurnerKey("owner") as Hex);
  const ownerEvm = ownerAccount.address.toLowerCase() as `0x${string}`;
  const ownerAccountId32 = candidateAAccountId32(ownerAccount.address);
  const properties = await readProperties(connection.api);
  const ownerSs58 = accountId32ToSs58(ownerAccountId32, properties.ss58Prefix);
  const artifact = await loadArtifact("ValueEcho");
  const wallet = await walletForMode("live", config.evmRpcUrl);
  const budget = await LiveBudget.load(client, ownerEvm);

  const startedAt = stamp(new Date());
  const nativeBefore = await systemAccount(connection.api, ownerSs58);
  const evmBefore = await getEvmBalance(client, ownerEvm);
  if (nativeBefore.free === "0" && evmBefore === 0n) throw new Error("owner has no balance; T026 must not run");

  const ratio = connection.api.consts.revive?.nativeToEthRatio as { toJSON?: () => unknown } | undefined;
  const observedRatio = ratio && typeof ratio.toJSON === "function" ? ratio.toJSON() : null;
  const nativeToEthRatio = BigInt(String(observedRatio));

  console.log(`T026 owner_ss58=${ownerSs58} owner_evm=${ownerEvm}`);
  const deployed = await deployProbe({
    path: "evm",
    wallet,
    client,
    contract: "ValueEcho",
    artifact,
    args: [],
    budget,
  });
  const deployFinality = await waitForFinalized(client, deployed.receipt.blockNumber);

  const valueWei = WEI_PER_TPOT / 100n; // 0.01 tPOT
  const echo = await sendBudgetedContract(wallet, client, budget, "T026 ValueEcho.record() with 0.01 tPOT", {
    address: deployed.address,
    abi: artifact.abi,
    functionName: "record",
    args: [],
    value: valueWei,
  });
  const echoFinality = await waitForFinalized(client, echo.receipt.blockNumber);

  const lastValue = (await client.readContract({
    address: deployed.address,
    abi: artifact.abi,
    functionName: "lastValue",
  })) as bigint;
  const lastSender = (await client.readContract({
    address: deployed.address,
    abi: artifact.abi,
    functionName: "lastSender",
  })) as string;

  const nativeAfter = await systemAccount(connection.api, ownerSs58);
  const evmAfter = await getEvmBalance(client, ownerEvm);
  const nativeDelta = BigInt(nativeBefore.free) - BigInt(nativeAfter.free);
  const evmDelta = evmBefore - evmAfter;
  const factor = nativeDelta > 0n ? impliedFactor(nativeDelta, evmDelta) : "unavailable";
  const confirmed = nativeDelta > 0n && factor === nativeToEthRatio.toString();
  const finishedAt = stamp(new Date());

  const summary = {
    at: finishedAt,
    started_at: startedAt,
    spec: connection.api.runtimeVersion.specName.toString(),
    spec_version: connection.api.runtimeVersion.specVersion.toString(),
    genesis: connection.api.genesisHash.toHex(),
    owner_ss58: ownerSs58,
    owner_evm: ownerEvm,
    owner_account_id32: ownerAccountId32,
    value_echo: deployed.address,
    deploy_hash: deployed.hash,
    deploy_block: Number(deployed.receipt.blockNumber),
    deploy_finalized: deployFinality,
    deploy_budget: deployed.budgetEntry,
    record_hash: echo.hash,
    record_block: Number(echo.receipt.blockNumber),
    record_finalized: echoFinality,
    record_budget: budget.entries[budget.entries.length - 1],
    expected_value_wei: valueWei.toString(),
    received_msg_value_wei: lastValue.toString(),
    received_msg_value_tpot: formatWeiTpot(lastValue),
    last_sender: lastSender,
    sender_match: lastSender.toLowerCase() === ownerEvm,
    native_before_planck: nativeBefore.free,
    native_after_planck: nativeAfter.free,
    native_delta_planck: nativeDelta.toString(),
    native_delta_tpot: formatTpot(nativeDelta),
    evm_before_wei: evmBefore.toString(),
    evm_after_wei: evmAfter.toString(),
    evm_delta_wei: evmDelta.toString(),
    implied_factor: factor,
    native_to_eth_ratio: nativeToEthRatio.toString(),
    wei_per_unit_confirmed_10000: confirmed,
    budget_spent_wei: budget.spent.toString(),
    budget_spent_tpot: formatWeiTpot(budget.spent),
    receipt_record: echo.receipt,
  };

  const rawPath = `${REPO_ROOT}/evidence/raw/g07/14-t026.json`;
  const summaryPath = `${REPO_ROOT}/evidence/raw/g07/15-t026-summary.txt`;
  await writeFile(
    rawPath,
    `${JSON.stringify(summary, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`,
  );
  const lines = [
    `# T026 ValueEcho and implied factor`,
    `at=${finishedAt}`,
    `owner_ss58=${ownerSs58}`,
    `owner_evm=${ownerEvm}`,
    `value_echo=${deployed.address}`,
    `deploy_tx=${deployed.hash}`,
    `deploy_finalized=${deployFinality.finalizedNumber} ${deployFinality.finalizedHash}`,
    `record_tx=${echo.hash}`,
    `record_finalized=${echoFinality.finalizedNumber} ${echoFinality.finalizedHash}`,
    `expected_value_wei=${valueWei}`,
    `received_msg_value_wei=${lastValue}`,
    `received_msg_value_tpot=${formatWeiTpot(lastValue)}`,
    `last_sender=${lastSender}`,
    `sender_match=${summary.sender_match}`,
    `native_delta_planck=${nativeDelta}`,
    `evm_delta_wei=${evmDelta}`,
    `implied_factor=${factor}`,
    `native_to_eth_ratio=${nativeToEthRatio}`,
    `wei_per_unit_10000_confirmed=${confirmed}`,
    `budget_spent_tpot=${formatWeiTpot(budget.spent)}`,
    ``,
  ];
  await writeFile(summaryPath, lines.join("\n"));
  console.log(lines.join("\n"));
  console.log(`evidence=${rawPath}`);
  console.log(`evidence=${summaryPath}`);
  await connection.disconnect();
  if (lastValue !== valueWei || !summary.sender_match) process.exit(1);
  if (!confirmed) process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
