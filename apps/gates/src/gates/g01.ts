import type { Address, Hex } from "viem";
import { loadConfig } from "../config.ts";
import { loadArtifact } from "../lib/artifacts.ts";
import { walletForMode } from "../lib/accounts.ts";
import { receiptGas } from "../lib/measure.ts";
import { getEvmBalance, publicClientFor } from "../lib/evm.ts";
import { RawLog, writeGateRecord, exitCodeFor } from "../lib/gateIO.ts";
import type { CostMeasurement, GateRecord, TransactionRef } from "../lib/evidence.ts";

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function run(options: { mode?: "live" | "local" } = {}): Promise<number> {
  const mode = options.mode ?? "live";
  const startedAt = new Date();
  const config = loadConfig();
  if (mode === "live" && config.evmRpcUrl.includes("127.0.0.1")) {
    throw new Error("live mode refuses a local RPC endpoint");
  }
  if (mode === "local" && !config.evmRpcUrl.includes("127.0.0.1")) {
    throw new Error("local mode requires a localhost RPC endpoint");
  }

  const artifact = await loadArtifact("CounterProbe");
  const client = publicClientFor(config.evmRpcUrl);
  const chainId = String(await client.getChainId());
  const wallet = await walletForMode(mode, config.evmRpcUrl);
  const account = wallet.account!.address;
  const balanceBefore = await getEvmBalance(client, account);
  if (balanceBefore === 0n) throw new Error(`account ${account} has zero EVM balance; fund it before sending`);

  const raw = mode === "live" ? await RawLog.create("G01") : null;
  const transactions: TransactionRef[] = [];
  const errors: Array<{ stage: string; message: string; at: string }> = [];
  const evidenceFiles: string[] = [];
  const measurements: CostMeasurement[] = [];
  const explorerBase = config.explorerUrl;

  try {
    const deployHash = await wallet.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [],
      account: wallet.account!,
      chain: wallet.chain,
    });
    const deployReceipt = await client.waitForTransactionReceipt({ hash: deployHash });
    if (!deployReceipt.contractAddress) throw new Error(`deployment ${deployHash} produced no contract address`);
    const address = deployReceipt.contractAddress;
    transactions.push({
      hash: deployHash,
      kind: "deploy CounterProbe",
      from: account,
      to: null,
      blockNumber: Number(deployReceipt.blockNumber),
      status: deployReceipt.status,
      explorerUrl: explorerBase ? `${explorerBase.replace(/\/$/, "")}/tx/${deployHash}` : null,
    });
    measurements.push(
      receiptGas("deploy-gas", deployReceipt.gasUsed, deployHash, {
        contract: "CounterProbe",
        compiler: artifact.metadata.compiler.version,
        evmVersion: artifact.metadata.settings.evmVersion,
        optimizer: `${artifact.metadata.settings.optimizer.enabled}:${artifact.metadata.settings.optimizer.runs}`,
        bytecodeBytes: (artifact.bytecode.object.length - 2) / 2,
      }),
    );

    const setHash = await wallet.writeContract({
      address,
      abi: artifact.abi,
      functionName: "set",
      args: [7n],
      account: wallet.account!,
      chain: wallet.chain,
    });
    const setReceipt = await client.waitForTransactionReceipt({ hash: setHash });
    if (setReceipt.status !== "success") throw new Error(`set(7) reverted in ${setHash}`);
    transactions.push({
      hash: setHash,
      kind: "set(7)",
      from: account,
      to: address,
      blockNumber: Number(setReceipt.blockNumber),
      status: setReceipt.status,
      explorerUrl: explorerBase ? `${explorerBase.replace(/\/$/, "")}/tx/${setHash}` : null,
    });
    measurements.push(receiptGas("set-gas", setReceipt.gasUsed, setHash, { contract: "CounterProbe", function: "set(7)" }));

    const value = (await client.readContract({ address, abi: artifact.abi, functionName: "get" })) as bigint;
    if (value !== 7n) throw new Error(`get() returned ${value}, expected 7`);

    const code = await client.getCode({ address });
    const codeBytes = code && code !== "0x" ? (code.length - 2) / 2 : 0;
    if (codeBytes === 0) throw new Error(`no code at ${address} after deployment`);

    const summary = {
      mode,
      at: stamp(new Date()),
      endpoint: config.evmRpcUrl,
      chainId,
      account,
      contract: address,
      compiler: artifact.metadata.compiler.version,
      evmVersion: artifact.metadata.settings.evmVersion,
      optimizer: artifact.metadata.settings.optimizer,
      bytecodeBytes: (artifact.bytecode.object.length - 2) / 2,
      deployedBytes: codeBytes,
      deployHash,
      deployGas: deployReceipt.gasUsed.toString(),
      setHash,
      setGas: setReceipt.gasUsed.toString(),
      get: value.toString(),
      balanceBefore: balanceBefore.toString(),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (raw) {
      const deployPath = await raw.write(
        "deploy-receipt",
        JSON.stringify(deployReceipt, (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry), 2),
      );
      const setPath = await raw.write(
        "set-receipt",
        JSON.stringify(setReceipt, (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry), 2),
      );
      const summaryPath = await raw.write("summary", JSON.stringify(summary, null, 2));
      evidenceFiles.push(raw.relative(deployPath), raw.relative(setPath), raw.relative(summaryPath));
    }

    if (mode === "local") return 0;

    const record: GateRecord = {
      schemaVersion: 1,
      gateId: "G01",
      runState: "done",
      verdict: "PASS",
      reason: null,
      startedAt: stamp(startedAt),
      finishedAt: stamp(new Date()),
      endpoint: config.evmRpcUrl,
      chainIdObserved: chainId,
      commands: [
        { command: "forge build --force", cwd: "contracts", exitCode: 0, rawOutput: evidenceFiles[2] ?? "", ranAt: stamp(startedAt) },
        { command: "node src/gates/runner.ts G01", cwd: "apps/gates", exitCode: 0, rawOutput: evidenceFiles[2] ?? "", ranAt: stamp(startedAt) },
      ],
      measurements,
      transactions,
      errors: [],
      verdictReason: `deployed CounterProbe at ${address}, set(7) and read 7 back`,
      classification: null,
      adaptation: null,
      evidenceFiles,
      details: { summary },
    };
    const recordPath = await writeGateRecord(record);
    console.log(`record=${recordPath}`);
    return exitCodeFor(record);
  } catch (error) {
    errors.push({ stage: `g01-${mode}`, message: `${(error as Error).name}: ${(error as Error).message}`, at: stamp(new Date()) });
    console.error(`G01 ${mode} attempt failed: ${(error as Error).message}`);
    if (mode === "live" && raw) {
      const errorPath = await raw.write("error", `${errors[0].message}\n`);
      const record: GateRecord = {
        schemaVersion: 1,
        gateId: "G01",
        runState: "blocked",
        verdict: null,
        reason: errors[0].message,
        startedAt: stamp(startedAt),
        finishedAt: stamp(new Date()),
        endpoint: config.evmRpcUrl,
        chainIdObserved: chainId,
        commands: [{ command: "node src/gates/runner.ts G01", cwd: "apps/gates", exitCode: 2, rawOutput: raw.relative(errorPath), ranAt: stamp(startedAt) }],
        measurements: [],
        transactions,
        errors,
        verdictReason: null,
        classification: null,
        adaptation: null,
        evidenceFiles: [raw.relative(errorPath)],
      };
      const recordPath = await writeGateRecord(record);
      console.error(`record=${recordPath}`);
      return exitCodeFor(record);
    }
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.includes("--local") ? "local" : "live";
  try {
    process.exit(await run({ mode }));
  } catch (error) {
    console.error((error as Error).stack ?? String(error));
    process.exit(1);
  }
}
