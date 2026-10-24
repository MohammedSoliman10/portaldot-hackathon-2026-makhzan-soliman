import type { Address } from "viem";
import { loadConfig } from "../config.ts";
import { loadArtifact } from "../lib/artifacts.ts";
import { walletForMode } from "../lib/accounts.ts";
import { receiptGas } from "../lib/measure.ts";
import { readChainIdentity } from "../lib/substrate.ts";
import { getEvmBalance, publicClientFor } from "../lib/evm.ts";
import { deployPathOrder, deployProbe, type DeployPath } from "../lib/deploy.ts";
import { formatWeiTpot, LiveBudget, sendBudgetedContract } from "../lib/budget.ts";
import { RawLog, writeGateRecord, exitCodeFor } from "../lib/gateIO.ts";
import type { CostMeasurement, GateRecord, TransactionRef } from "../lib/evidence.ts";

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry), 2);
}

export async function run(options: { mode?: "live" | "local"; firstPath?: DeployPath } = {}): Promise<number> {
  const mode = options.mode ?? "live";
  const startedAt = new Date();
  const config = loadConfig();
  if (mode === "live" && config.evmRpcUrl.includes("127.0.0.1")) {
    throw new Error("live mode refuses a local RPC endpoint");
  }
  if (mode === "local" && !config.evmRpcUrl.includes("127.0.0.1")) {
    throw new Error("local mode requires a localhost RPC endpoint");
  }
  if (mode === "local" && options.firstPath === "pvm") {
    throw new Error("local anvil cannot execute a PolkaVM blob; use --path evm for local mode");
  }

  const artifact = await loadArtifact("CounterProbe");
  const client = publicClientFor(config.evmRpcUrl);
  const chainId = String(await client.getChainId());
  const chainIdentity = mode === "live"
    ? await readChainIdentity(config.wsUrl).catch((error) => ({ error: `${(error as Error).name}: ${(error as Error).message}` }))
    : { skipped: "local mode; chain identity is recorded by live gates only" };
  const wallet = await walletForMode(mode, config.evmRpcUrl);
  const account = wallet.account!.address;
  const balanceBefore = await getEvmBalance(client, account);
  if (balanceBefore === 0n) throw new Error(`account ${account} has zero EVM balance; fund it before sending`);
  const budget = mode === "live" ? await LiveBudget.load(client, account) : null;

  const raw = mode === "live" ? await RawLog.create("G01") : null;
  const transactions: TransactionRef[] = [];
  const errors: Array<{ stage: string; message: string; at: string }> = [];
  const evidenceFiles: string[] = [];
  const measurements: CostMeasurement[] = [];
  const explorerBase = config.explorerUrl;
  const attempts: Array<Record<string, unknown>> = [];

  // EVM/solc first because the chain reports allowEVMBytecode=true; PVM is the fallback.
  const order: DeployPath[] =
    mode === "local" ? ["evm"] : options.firstPath ? deployPathOrder(options.firstPath) : ["evm", "pvm"];

  const explorer = (hash: string) => (explorerBase ? `${explorerBase.replace(/\/$/, "")}/tx/${hash}` : null);

  try {
    let summary: Record<string, unknown> | null = null;
    let deployReceiptJson: string | null = null;
    let setReceiptJson: string | null = null;

    for (const path of order) {
      const attemptStarted = Date.now();
      try {
        const deployed = await deployProbe({ path, wallet, client, contract: "CounterProbe", artifact, args: [], budget: budget ?? undefined });
        const address: Address = deployed.address;
        deployReceiptJson = jsonSafe(deployed.receipt);
        transactions.push({
          hash: deployed.hash,
          kind: `deploy CounterProbe (${path})`,
          from: account,
          to: null,
          blockNumber: Number(deployed.receipt.blockNumber),
          status: deployed.receipt.status,
          explorerUrl: explorer(deployed.hash),
        });
        measurements.push(
          receiptGas("deploy-gas", deployed.receipt.gasUsed, deployed.hash, {
            contract: "CounterProbe",
            path,
            compiler: deployed.compiler,
            evmVersion: deployed.evmVersion ?? "n/a (resolc/PolkaVM)",
            optimizer: path === "evm" ? `${artifact.metadata.settings.optimizer.enabled}:${artifact.metadata.settings.optimizer.runs}` : "resolc -O3",
            bytecodeBytes: deployed.bytecodeBytes,
          }),
        );

        const setResult = mode === "live" && budget
          ? await sendBudgetedContract(wallet, client, budget, "CounterProbe.set(7)", {
              address,
              abi: artifact.abi,
              functionName: "set",
              args: [7n],
            })
          : {
              hash: await wallet.writeContract({
                address,
                abi: artifact.abi,
                functionName: "set",
                args: [7n],
                account: wallet.account!,
                chain: wallet.chain,
              }),
              receipt: null,
            };
        const setHash = setResult.hash;
        const setReceipt = setResult.receipt ?? (await client.waitForTransactionReceipt({ hash: setHash }));
        if (setReceipt.status !== "success") throw new Error(`set(7) reverted in ${setHash}`);
        setReceiptJson = jsonSafe(setReceipt);
        transactions.push({
          hash: setHash,
          kind: `set(7) (${path})`,
          from: account,
          to: address,
          blockNumber: Number(setReceipt.blockNumber),
          status: setReceipt.status,
          explorerUrl: explorer(setHash),
        });
        measurements.push(receiptGas("set-gas", setReceipt.gasUsed, setHash, { contract: "CounterProbe", path, function: "set(7)" }));

        const value = (await client.readContract({ address, abi: artifact.abi, functionName: "get" })) as bigint;
        if (value !== 7n) throw new Error(`get() returned ${value}, expected 7`);

        const code = await client.getCode({ address });
        const deployedBytes = code && code !== "0x" ? (code.length - 2) / 2 : 0;
        if (deployedBytes === 0) throw new Error(`no code at ${address} after deployment`);

        summary = {
          mode,
          at: stamp(new Date()),
          endpoint: config.evmRpcUrl,
          chainId,
          account,
          path,
          contract: address,
          compiler: deployed.compiler,
          evmVersion: deployed.evmVersion,
          optimizer: path === "evm" ? artifact.metadata.settings.optimizer : "resolc -O3",
          bytecodeBytes: deployed.bytecodeBytes,
          deployedBytes,
          pvm: deployed.pvm ? { sha256: deployed.pvm.sha256, bytes: deployed.pvm.bytes, solc: deployed.pvm.solc } : null,
          deployHash: deployed.hash,
          deployGas: deployed.receipt.gasUsed.toString(),
          setHash,
          setGas: setReceipt.gasUsed.toString(),
          get: value.toString(),
          balanceBefore: balanceBefore.toString(),
          budgetSpentTpot: budget ? formatWeiTpot(budget.spent) : null,
          attempts,
        };
        attempts.push({ path, status: "success", ms: Date.now() - attemptStarted });
        break;
      } catch (error) {
        const message = `${(error as Error).name}: ${(error as Error).message}`;
        attempts.push({ path, status: "failed", ms: Date.now() - attemptStarted, error: message });
        errors.push({ stage: `g01-${mode}-${path}`, message, at: stamp(new Date()) });
        console.error(`G01 ${mode} ${path} path failed: ${message}`);
      }
    }

    if (!summary) throw new Error(`all deployment paths failed: ${attempts.map((entry) => `${entry.path}: ${entry.error}`).join(" | ")}`);
    console.log(JSON.stringify(summary, null, 2));

    if (raw) {
      const deployPath = await raw.write("deploy-receipt", deployReceiptJson ?? jsonSafe({ attempts }));
      const setPath = await raw.write("set-receipt", setReceiptJson ?? jsonSafe({ attempts }));
      const summaryPath = await raw.write("summary", jsonSafe(summary));
      evidenceFiles.push(raw.relative(deployPath), raw.relative(setPath), raw.relative(summaryPath));
    }

    if (mode === "local") return 0;

    const selected = summary.path as DeployPath;
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
        { command: `node src/gates/runner.ts G01 --path ${selected}`, cwd: "apps/gates", exitCode: 0, rawOutput: evidenceFiles[2] ?? "", ranAt: stamp(startedAt) },
      ],
      measurements,
      transactions,
      errors,
      verdictReason: `deployed CounterProbe through the ${selected} path at ${summary.contract}, set(7) and read 7 back`,
      classification: null,
      adaptation: null,
      evidenceFiles,
      details: { chainIdentity, summary, attempts },
    };
    const recordPath = await writeGateRecord(record);
    console.log(`record=${recordPath}`);
    return exitCodeFor(record);
  } catch (error) {
    if (errors.length === 0) {
      errors.push({ stage: `g01-${mode}`, message: `${(error as Error).name}: ${(error as Error).message}`, at: stamp(new Date()) });
    }
    console.error(`G01 ${mode} attempt failed: ${(error as Error).message}`);
    if (mode === "live" && raw) {
      const errorPath = await raw.write("error", `${errors.map((entry) => entry.message).join("\n")}\n`);
      const record: GateRecord = {
        schemaVersion: 1,
        gateId: "G01",
        runState: "blocked",
        verdict: null,
        reason: errors.map((entry) => entry.message).join(" | "),
        startedAt: stamp(startedAt),
        finishedAt: stamp(new Date()),
        endpoint: config.evmRpcUrl,
        chainIdObserved: chainId,
        commands: [{ command: "node src/gates/runner.ts G01", cwd: "apps/gates", exitCode: 2, rawOutput: raw.relative(errorPath), ranAt: stamp(startedAt) }],
        measurements,
        transactions,
        errors,
        verdictReason: null,
        classification: null,
        adaptation: null,
        evidenceFiles: [raw.relative(errorPath)],
        details: { chainIdentity, attempts },
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
  const pathIndex = process.argv.indexOf("--path");
  const pathValue = pathIndex >= 0 ? process.argv[pathIndex + 1] : "auto";
  if (!["auto", "evm", "pvm"].includes(pathValue)) throw new Error(`--path must be auto, evm or pvm, got ${pathValue}`);
  try {
    process.exit(await run({ mode, firstPath: pathValue === "auto" ? undefined : (pathValue as DeployPath) }));
  } catch (error) {
    console.error((error as Error).stack ?? String(error));
    process.exit(1);
  }
}
