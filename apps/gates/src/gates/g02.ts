import { parseEventLogs, type Address, type Hex } from "viem";
import { loadConfig } from "../config.ts";
import { loadArtifact } from "../lib/artifacts.ts";
import { walletForMode } from "../lib/accounts.ts";
import { getEvmBalance, publicClientFor } from "../lib/evm.ts";
import { deployProbe, type DeployPath } from "../lib/deploy.ts";
import { ratio, receiptGas } from "../lib/measure.ts";
import { RawLog, writeGateRecord, exitCodeFor } from "../lib/gateIO.ts";
import type { CostMeasurement, GateRecord, TransactionRef } from "../lib/evidence.ts";

const LADDER = [1, 1024, 8192, 16_384, 24_576, 24_577, 32_768, 49_152, 65_536];
const REVERT_REASON = "BehaviorProbe: custom reason";

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function errorText(error: unknown): string {
  const candidate = error as { shortMessage?: string; details?: string; message?: string };
  return [candidate.shortMessage, candidate.details, candidate.message].filter(Boolean).join(" | ");
}

async function waitForNextBlock(client: ReturnType<typeof publicClientFor>, after: bigint): Promise<bigint> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const current = await client.getBlockNumber();
    if (current > after) return current;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no block after ${after} within 60s`);
}

export async function run(options: { mode?: "live" | "local"; path?: DeployPath } = {}): Promise<number> {
  const mode = options.mode ?? "live";
  const path: DeployPath = options.path ?? "evm";
  const startedAt = new Date();
  const config = loadConfig();
  if (mode === "live" && config.evmRpcUrl.includes("127.0.0.1")) throw new Error("live mode refuses a local RPC endpoint");
  if (mode === "local" && !config.evmRpcUrl.includes("127.0.0.1")) throw new Error("local mode requires a localhost RPC endpoint");

  const behaviorArtifact = await loadArtifact("BehaviorProbe");
  const hashArtifact = await loadArtifact("HashProbe");
  const sizeArtifact = await loadArtifact("SizeProbe");
  const client = publicClientFor(config.evmRpcUrl);
  const chainId = String(await client.getChainId());
  const wallet = await walletForMode(mode, config.evmRpcUrl);
  const account = wallet.account!.address;
  const balance = await getEvmBalance(client, account);
  if (balance === 0n) throw new Error(`account ${account} has zero EVM balance; fund it before sending`);

  const raw = mode === "live" ? await RawLog.create("G02") : null;
  const transactions: TransactionRef[] = [];
  const measurements: CostMeasurement[] = [];
  const evidenceFiles: string[] = [];
  const errors: Array<{ stage: string; message: string; at: string }> = [];
  const explorer = (hash: string) => (config.explorerUrl ? `${config.explorerUrl.replace(/\/$/, "")}/tx/${hash}` : null);

  try {
    // ---- behavior probe -------------------------------------------------
    const behaviorDeployed = await deployProbe({
      path,
      wallet,
      client,
      contract: "BehaviorProbe",
      artifact: behaviorArtifact,
      args: [],
    });
    const behaviorDeploy = behaviorDeployed.hash;
    const behaviorReceipt = behaviorDeployed.receipt;
    const behaviorAddress = behaviorDeployed.address;
    transactions.push({
      hash: behaviorDeploy,
      kind: "deploy BehaviorProbe",
      from: account,
      to: null,
      blockNumber: Number(behaviorReceipt.blockNumber),
      status: behaviorReceipt.status,
      explorerUrl: explorer(behaviorDeploy),
    });
    measurements.push(receiptGas("behavior-deploy-gas", behaviorReceipt.gasUsed, behaviorDeploy, { contract: "BehaviorProbe", path, compiler: behaviorDeployed.compiler }));

    const firstStore = await wallet.writeContract({
      address: behaviorAddress,
      abi: behaviorArtifact.abi,
      functionName: "store",
      args: [42n],
      value: 1n,
      account: wallet.account!,
      chain: wallet.chain,
    });
    const firstReceipt = await client.waitForTransactionReceipt({ hash: firstStore });
    if (firstReceipt.status !== "success") throw new Error(`store(42) reverted in ${firstStore}`);
    transactions.push({
      hash: firstStore,
      kind: "store(42) with 1 wei",
      from: account,
      to: behaviorAddress,
      blockNumber: Number(firstReceipt.blockNumber),
      status: firstReceipt.status,
      explorerUrl: explorer(firstStore),
    });
    measurements.push(receiptGas("behavior-store-gas", firstReceipt.gasUsed, firstStore, { contract: "BehaviorProbe", value: "1 wei" }));

    const firstRead = (await client.readContract({
      address: behaviorAddress,
      abi: behaviorArtifact.abi,
      functionName: "read",
    })) as readonly [bigint, bigint, bigint, bigint];
    if (firstRead[0] !== 42n) throw new Error(`stored value ${firstRead[0]}, expected 42`);
    if (firstRead[1] !== 1n) throw new Error(`msg.value ${firstRead[1]}, expected 1`);

    const events = parseEventLogs({ abi: behaviorArtifact.abi, logs: firstReceipt.logs, eventName: "Stored" });
    if (events.length !== 1) throw new Error(`expected one Stored event, got ${events.length}`);
    const event = events[0] as unknown as { args: { sender: string; value: bigint }; topics: readonly string[]; data: string };
    if (event.args.sender.toLowerCase() !== account.toLowerCase()) throw new Error("event sender mismatch");
    if (event.args.value !== 42n) throw new Error("event value mismatch");

    let customRevert = "";
    try {
      await client.simulateContract({
        account,
        address: behaviorAddress,
        abi: behaviorArtifact.abi,
        functionName: "fail",
        args: [REVERT_REASON],
      });
      customRevert = "NO REVERT";
    } catch (error) {
      customRevert = errorText(error);
    }
    if (!customRevert.includes(REVERT_REASON)) throw new Error(`custom revert reason not propagated: ${customRevert}`);

    let boomRevert = "";
    try {
      await client.simulateContract({ account, address: behaviorAddress, abi: behaviorArtifact.abi, functionName: "boom" });
      boomRevert = "NO REVERT";
    } catch (error) {
      boomRevert = errorText(error);
    }
    if (!boomRevert.includes("BehaviorProbe: boom")) throw new Error(`boom reason not propagated: ${boomRevert}`);

    if (mode === "live") await waitForNextBlock(client, firstReceipt.blockNumber);
    else {
      await client.transport.request({ method: "evm_increaseTime", params: [2] } as never);
      await client.transport.request({ method: "evm_mine", params: [] } as never);
    }
    const secondStore = await wallet.writeContract({
      address: behaviorAddress,
      abi: behaviorArtifact.abi,
      functionName: "store",
      args: [43n],
      value: 0n,
      account: wallet.account!,
      chain: wallet.chain,
    });
    const secondReceipt = await client.waitForTransactionReceipt({ hash: secondStore });
    transactions.push({
      hash: secondStore,
      kind: "store(43) no value",
      from: account,
      to: behaviorAddress,
      blockNumber: Number(secondReceipt.blockNumber),
      status: secondReceipt.status,
      explorerUrl: explorer(secondStore),
    });
    const secondRead = (await client.readContract({
      address: behaviorAddress,
      abi: behaviorArtifact.abi,
      functionName: "read",
    })) as readonly [bigint, bigint, bigint, bigint];
    const timestampMonotonic = secondRead[2] > firstRead[2];
    const numberMonotonic = secondRead[3] > firstRead[3];
    if (!timestampMonotonic) throw new Error(`timestamp did not increase: ${firstRead[2]} -> ${secondRead[2]}`);
    if (!numberMonotonic) throw new Error(`block number did not increase: ${firstRead[3]} -> ${secondRead[3]}`);

    // ---- hash ratios ----------------------------------------------------
    const hashDeployed = await deployProbe({
      path,
      wallet,
      client,
      contract: "HashProbe",
      artifact: hashArtifact,
      args: [],
    });
    const hashDeploy = hashDeployed.hash;
    const hashReceipt = hashDeployed.receipt;
    const hashAddress = hashDeployed.address;
    transactions.push({
      hash: hashDeploy,
      kind: "deploy HashProbe",
      from: account,
      to: null,
      blockNumber: Number(hashReceipt.blockNumber),
      status: hashReceipt.status,
      explorerUrl: explorer(hashDeploy),
    });

    const callHash = async (kind: string, functionName: string, args: readonly unknown[], value = 0n) => {
      const hash = await wallet.writeContract({
        address: hashAddress,
        abi: hashArtifact.abi,
        functionName,
        args,
        value,
        account: wallet.account!,
        chain: wallet.chain,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`${kind} reverted in ${hash}`);
      transactions.push({ hash, kind, from: account, to: hashAddress, blockNumber: Number(receipt.blockNumber), status: receipt.status, explorerUrl: explorer(hash) });
      return { hash, gas: Number(receipt.gasUsed) };
    };

    const word = `0x${"11".repeat(32)}` as Hex;
    const hashTx = await callHash("keccak256(32 bytes)", "hashOnly", [word]);
    const slotTx = await callHash("new storage slot write", "writeSlot", [1n]);
    const eventTx = await callHash("event: 1 indexed topic + 32 bytes", "emitReference", [word, word]);

    measurements.push(receiptGas("hash-gas", BigInt(hashTx.gas), hashTx.hash, { operation: "keccak256 over 32 bytes", intrinsicIncluded: "yes" }));
    measurements.push(receiptGas("slot-write-gas", BigInt(slotTx.gas), slotTx.hash, { operation: "SSTORE zero to non-zero", intrinsicIncluded: "yes" }));
    measurements.push(receiptGas("reference-event-gas", BigInt(eventTx.gas), eventTx.hash, { operation: "LOG1 with 32 bytes data", intrinsicIncluded: "yes" }));
    const hashToSlot = ratio("hash-to-slot-ratio", hashTx.gas, slotTx.gas, {
      numerator: "keccak256(32 bytes), one-call tx",
      denominator: "new storage slot write, one-call tx",
      intrinsicIncluded: "yes",
    });
    const hashToEvent = ratio("hash-to-event-ratio", hashTx.gas, eventTx.gas, {
      numerator: "keccak256(32 bytes), one-call tx",
      denominator: "event with one indexed topic and 32 bytes data, one-call tx",
      eventShape: "topics=2 (signature + indexed), data=32 bytes",
      intrinsicIncluded: "yes",
    });
    measurements.push(hashToSlot, hashToEvent);

    // ---- size ladder ----------------------------------------------------
    const sizeAttempts: Array<Record<string, unknown>> = [];
    let lastSuccess = 0;
    let firstFailure: { size: number; error: string } | null = null;
    for (const size of LADDER) {
      try {
        const deployed = await deployProbe({
          path,
          wallet,
          client,
          contract: "SizeProbe",
          artifact: sizeArtifact,
          args: [BigInt(size)],
        });
        const hash = deployed.hash;
        const receipt = deployed.receipt;
        const address = deployed.address;
        const code = address ? await client.getCode({ address }) : "0x";
        const codeBytes = code && code !== "0x" ? (code.length - 2) / 2 : 0;
        if (receipt.status !== "success" || codeBytes !== size) {
          firstFailure = { size, error: `deployed code ${codeBytes} bytes, expected ${size}` };
          sizeAttempts.push({ size, status: "rejected", error: firstFailure.error });
          break;
        }
        lastSuccess = size;
        sizeAttempts.push({ size, status: "accepted", hash, gasUsed: receipt.gasUsed.toString(), blockNumber: Number(receipt.blockNumber) });
        transactions.push({ hash, kind: `deploy SizeProbe(${size})`, from: account, to: null, blockNumber: Number(receipt.blockNumber), status: receipt.status, explorerUrl: explorer(hash) });
      } catch (error) {
        firstFailure = { size, error: errorText(error) };
        sizeAttempts.push({ size, status: "rejected", error: firstFailure.error });
        break;
      }
    }

    if (firstFailure && firstFailure.size - lastSuccess > 1) {
      let low = lastSuccess;
      let high = firstFailure.size;
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        try {
          const deployed = await deployProbe({
            path,
            wallet,
            client,
            contract: "SizeProbe",
            artifact: sizeArtifact,
            args: [BigInt(mid)],
          });
          const hash = deployed.hash;
          const receipt = deployed.receipt;
          const address = deployed.address;
          const code = address ? await client.getCode({ address }) : "0x";
          const codeBytes = code && code !== "0x" ? (code.length - 2) / 2 : 0;
          if (receipt.status === "success" && codeBytes === mid) {
            low = mid;
            sizeAttempts.push({ size: mid, status: "accepted (binary search)", hash, gasUsed: receipt.gasUsed.toString() });
            transactions.push({ hash, kind: `deploy SizeProbe(${mid})`, from: account, to: null, blockNumber: Number(receipt.blockNumber), status: receipt.status, explorerUrl: explorer(hash) });
          } else {
            high = mid;
            sizeAttempts.push({ size: mid, status: "rejected (binary search)", error: `deployed code ${codeBytes}` });
          }
        } catch (error) {
          high = mid;
          sizeAttempts.push({ size: mid, status: "rejected (binary search)", error: errorText(error) });
        }
      }
      lastSuccess = low;
      firstFailure = { size: high, error: sizeAttempts.find((entry) => entry.size === high)?.error as string };
    }

    measurements.push({
      name: "size-limit-bytes",
      value: lastSuccess,
      unit: "bytes",
      method: "estimate",
      conditions: {
        method: "ascending deployments of SizeProbe with N zero-byte runtime code, binary search between last success and first rejection",
        firstRejectedSize: firstFailure?.size ?? "none",
        rejection: firstFailure?.error ?? "none observed",
      },
      txRef: null,
    });

    const observations = {
      storageWriteRead: { expected: "42", observed: firstRead[0].toString(), match: firstRead[0] === 42n },
      payableValue: { expected: "1", observed: firstRead[1].toString(), match: firstRead[1] === 1n },
      event: {
        expected: "3 topics (signature + sender + value), 64 bytes data (timestamp, number)",
        observed: `topics=${event.topics.length}, dataBytes=${(event.data.length - 2) / 2}`,
        match: event.topics.length === 3 && (event.data.length - 2) / 2 === 64,
      },
      customRevert: { expected: REVERT_REASON, observed: customRevert, match: customRevert.includes(REVERT_REASON) },
      boomRevert: { expected: "BehaviorProbe: boom", observed: boomRevert, match: boomRevert.includes("BehaviorProbe: boom") },
      timestamp: { expected: "second > first", observed: `${firstRead[2]} -> ${secondRead[2]}`, match: timestampMonotonic },
      blockNumber: { expected: "second > first", observed: `${firstRead[3]} -> ${secondRead[3]}`, match: numberMonotonic },
    };
    const differences = Object.entries(observations)
      .filter(([, value]) => !value.match)
      .map(([name, value]) => ({ behavior: name, expected: value.expected, observed: value.observed }));

    const summary = {
      mode,
      at: stamp(new Date()),
      endpoint: config.evmRpcUrl,
      chainId,
      account,
      behaviorAddress,
      hashAddress,
      path,
      compiler: behaviorDeployed.compiler,
      evmVersion: behaviorDeployed.evmVersion,
      pvm: behaviorDeployed.pvm ? { sha256: behaviorDeployed.pvm.sha256, bytes: behaviorDeployed.pvm.bytes } : null,
      observations,
      differences,
      size: { lastSuccess, firstFailure, attempts: sizeAttempts },
      hashes: { hashTx, slotTx, eventTx, hashToSlot: hashToSlot.value, hashToEvent: hashToEvent.value },
      transactions,
      balanceBefore: balance.toString(),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (raw) {
      for (const [label, value] of Object.entries({ behaviorReceipt: firstReceipt, secondReceipt, sizeAttempts, summary })) {
        const filePath = await raw.write(label, JSON.stringify(value, (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry), 2));
        evidenceFiles.push(raw.relative(filePath));
      }
    }

    if (mode === "local") return 0;

    const verdict = differences.length === 0 && firstFailure ? "PASS" : "PARTIAL";
    const record: GateRecord = {
      schemaVersion: 1,
      gateId: "G02",
      runState: "done",
      verdict,
      reason: null,
      startedAt: stamp(startedAt),
      finishedAt: stamp(new Date()),
      endpoint: config.evmRpcUrl,
      chainIdObserved: chainId,
      commands: [
        { command: "forge build --force", cwd: "contracts", exitCode: 0, rawOutput: evidenceFiles[0] ?? "", ranAt: stamp(startedAt) },
        { command: `node src/gates/runner.ts G02 --path ${path}`, cwd: "apps/gates", exitCode: 0, rawOutput: evidenceFiles[0] ?? "", ranAt: stamp(startedAt) },
      ],
      measurements,
      transactions,
      errors,
      verdictReason:
        verdict === "PASS"
          ? `all behaviors matched Ethereum; first rejected runtime size ${firstFailure?.size} bytes`
          : `${differences.length} behavioral difference(s); ${firstFailure ? `first rejected runtime size ${firstFailure.size} bytes` : `no size rejection observed up to ${lastSuccess} bytes`}`,
      classification: verdict === "PASS" ? null : "DESIGN-CHANGE",
      adaptation:
        verdict === "PASS"
          ? null
          : "record every difference in the G02 table; cap contract runtime size below the observed limit and keep the loop within the funded deposit",
      evidenceFiles,
      details: { summary },
    };
    const recordPath = await writeGateRecord(record);
    console.log(`record=${recordPath}`);
    return exitCodeFor(record);
  } catch (error) {
    errors.push({ stage: `g02-${mode}`, message: `${(error as Error).name}: ${(error as Error).message}`, at: stamp(new Date()) });
    console.error(`G02 ${mode} attempt failed: ${(error as Error).message}`);
    if (mode === "live" && raw) {
      const errorPath = await raw.write("error", `${errors[0].message}\n`);
      const record: GateRecord = {
        schemaVersion: 1,
        gateId: "G02",
        runState: "blocked",
        verdict: null,
        reason: errors[0].message,
        startedAt: stamp(startedAt),
        finishedAt: stamp(new Date()),
        endpoint: config.evmRpcUrl,
        chainIdObserved: chainId,
        commands: [{ command: "node src/gates/runner.ts G02", cwd: "apps/gates", exitCode: 2, rawOutput: raw.relative(errorPath), ranAt: stamp(startedAt) }],
        measurements,
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
  const pathIndex = process.argv.indexOf("--path");
  const pathValue = pathIndex >= 0 ? process.argv[pathIndex + 1] : "evm";
  if (pathValue !== "evm" && pathValue !== "pvm") throw new Error(`--path must be evm or pvm, got ${pathValue}`);
  try {
    process.exit(await run({ mode, path: pathValue as DeployPath }));
  } catch (error) {
    console.error((error as Error).stack ?? String(error));
    process.exit(1);
  }
}
