import { encodeDeployData, type Abi, type Address, type Hash, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import type { Artifact } from "./artifacts.ts";
import { compilePvm, type PvmArtifact } from "./pvm.ts";
import type { LiveBudget, SpendEntry } from "./budget.ts";

export type DeployPath = "evm" | "pvm";

/** allowEVMBytecode=true makes the solc/EVM path the first attempt. */
export function deployPathOrder(first: DeployPath): DeployPath[] {
  return first === "evm" ? ["evm", "pvm"] : ["pvm", "evm"];
}

export interface DeployProbeInput {
  path: DeployPath;
  wallet: WalletClient;
  client: PublicClient;
  contract: string;
  artifact: Artifact;
  args?: readonly unknown[];
  value?: bigint;
  budget?: LiveBudget;
}

export interface DeployProbeResult {
  path: DeployPath;
  address: Address;
  hash: Hash;
  receipt: TransactionReceipt;
  bytecodeBytes: number;
  compiler: string;
  evmVersion: string | null;
  pvm: PvmArtifact | null;
  budgetEntry: SpendEntry | null;
}

/**
 * Deploy the same Solidity source through either compiler path:
 * - evm: forge/solc artifact bytecode
 * - pvm: resolc PolkaVM blob (constructor args still ABI-encoded by viem)
 */
export async function deployProbe(input: DeployProbeInput): Promise<DeployProbeResult> {
  const { path, wallet, client, contract, artifact } = input;
  const account = wallet.account;
  if (!account) throw new Error("wallet has no account");

  const pvm = path === "pvm" ? await compilePvm(contract) : null;
  const bytecode = path === "pvm" ? (pvm!.hex as Hex) : artifact.bytecode.object;
  const args = (input.args ?? []) as readonly unknown[];
  const data = encodeDeployData({ abi: artifact.abi, bytecode, args: args as never });
  const ticket = input.budget
    ? await input.budget.preflight(`deploy ${contract} (${path})`, { data, value: input.value ?? 0n })
    : null;
  const hash = await wallet.deployContract({
    abi: artifact.abi as Abi,
    bytecode,
    args: args as never,
    value: input.value ?? 0n,
    account,
    chain: wallet.chain,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const budgetEntry = ticket && input.budget ? await input.budget.record(ticket, hash) : null;
  if (receipt.status !== "success") throw new Error(`${path} deployment ${hash} reverted`);
  if (!receipt.contractAddress) throw new Error(`${path} deployment ${hash} produced no contract address`);

  return {
    path,
    address: receipt.contractAddress,
    hash,
    receipt,
    bytecodeBytes: (bytecode.length - 2) / 2,
    compiler: path === "pvm" ? pvm!.resolcVersion : artifact.metadata.compiler.version,
    evmVersion: path === "pvm" ? null : artifact.metadata.settings.evmVersion,
    pvm,
    budgetEntry,
  };
}
