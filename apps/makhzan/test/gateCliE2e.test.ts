import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { main } from "../src/cliMain.ts";
import { parseDeployArgs, runDeploy, type DeployDeps, type DeploySettings } from "../src/deploy.ts";
import { WEI_PER_UNIT } from "../src/units.ts";

const PORT = 8564;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 420_420_777;
const MNEMONIC = "test test test test test test test test test test test junk";

const chain = defineChain({
  id: CHAIN_ID,
  name: "makhzan-local",
  nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const transport = http(RPC);
const publicClient = createPublicClient({ chain, transport });

const ownerAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
const providerAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 1 });

const ownerKey = bytesToHex(ownerAccount.getHdKey().privateKey!);
const providerKey = bytesToHex(providerAccount.getHdKey().privateKey!);

let anvil: ReturnType<typeof spawn>;
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-gate-cli-e2e-"));
  dirs.push(dir);
  return dir;
}

before(async () => {
  anvil = spawn("anvil", ["--chain-id", String(CHAIN_ID), "--port", String(PORT), "--silent"], {
    stdio: "ignore",
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await publicClient.getBlockNumber();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error("anvil did not start");
});

after(() => {
  anvil?.kill("SIGTERM");
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function mineBlocks(count: bigint): Promise<void> {
  const request = publicClient.request as (args: { method: string; params: unknown[] }) => Promise<unknown>;
  await request({ method: "anvil_mine", params: [`0x${count.toString(16)}`, "0x0"] });
}

test("local anvil end-to-end through CLI: lock, release, refund, BondTooLow", async () => {
  const dir = tempDir();
  const ownerWallet = createWalletClient({ account: ownerAccount, chain, transport });
  const providerWallet = createWalletClient({ account: providerAccount, chain, transport });

  // 1. Deploy Makhzan & StorageGate
  const settings: DeploySettings = {
    network: "local",
    rpcUrl: RPC,
    chainId: CHAIN_ID,
    privateKey: ownerKey,
  };
  const deps: DeployDeps = {
    chainId: () => publicClient.getChainId(),
    estimateGas: (data) => publicClient.estimateGas({ account: ownerAccount.address, data }),
    gasPrice: () => publicClient.getGasPrice(),
    balance: (address) => publicClient.getBalance({ address }),
    nonce: (address) => publicClient.getTransactionCount({ address, blockTag: "pending" }),
    send: (data) => ownerWallet.sendTransaction({ account: ownerAccount, chain, data }),
    receipt: (hash) => publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 }),
    transaction: (hash) => publicClient.getTransaction({ hash }),
    code: (address) => publicClient.getCode({ address }),
    peek: async (address) => [
      (await publicClient.getStorageAt({ address, slot: "0x0" })) as Hex,
    ],
    makhzanOf: async (address) =>
      (await publicClient.readContract({
        address,
        abi: parseAbi(["function makhzan() view returns (address)"]),
        functionName: "makhzan",
      })) as Hex,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };

  const makhzanArgs = parseDeployArgs(
    ["--min-bond", (10n * 10n ** 18n).toString(), "--out", join(dir, "makhzan.json")],
    {},
  );
  const makhzan = await runDeploy(makhzanArgs, settings, () => {}, {
    deps,
    evidenceDir: dir,
    pendingFile: join(dir, "pending-makhzan.json"),
  });
  const makhzanAddress = makhzan.record!.address as Hex;

  const gateArgs = parseDeployArgs(
    ["--contract", "gate", "--makhzan", makhzanAddress, "--out", join(dir, "gate.json")],
    {},
  );
  const gate = await runDeploy(gateArgs, settings, () => {}, {
    deps,
    evidenceDir: dir,
    pendingFile: join(dir, "pending-gate.json"),
  });
  const gateAddress = gate.record!.address as Hex;

  // 2. Register Provider (id 1, bond 24 tPOT = 2.4e15 units)
  const makhzanAbi = parseAbi([
    "function registerProvider() payable",
    "function createDeal(uint16 providerId, bytes32 root, uint24 leafCount, uint32 size, uint32 durationBlocks, uint64 price) payable",
  ]);
  const regHash = await providerWallet.writeContract({
    address: makhzanAddress,
    abi: makhzanAbi,
    functionName: "registerProvider",
    value: 24n * 10n ** 18n,
  });
  await publicClient.waitForTransactionReceipt({ hash: regHash });

  // 3. Create Deal 1 (5 tPOT price, 60 blocks duration)
  const dummyRoot = `0x${"12".repeat(32)}` as Hex;
  const createHash = await ownerWallet.writeContract({
    address: makhzanAddress,
    abi: makhzanAbi,
    functionName: "createDeal",
    args: [1, dummyRoot, 1024, 1048576, 60, 500000000000000n],
    value: 5n * 10n ** 18n,
  });
  await publicClient.waitForTransactionReceipt({ hash: createHash });

  const ownerEnv: NodeJS.ProcessEnv = {
    MAKHZAN_NETWORK: "local",
    MAKHZAN_RPC_URL: RPC,
    MAKHZAN_CHAIN_ID: String(CHAIN_ID),
    MAKHZAN_CONTRACT: makhzanAddress,
    MAKHZAN_GATE: gateAddress,
    MAKHZAN_PRIVATE_KEY: ownerKey,
    MAKHZAN_EVIDENCE_DIR: dir,
  };
  const providerEnv: NodeJS.ProcessEnv = {
    ...ownerEnv,
    MAKHZAN_PRIVATE_KEY: providerKey,
  };

  // 4. CLI: gate status 1 (before lock)
  const statusLinesPre: string[] = [];
  const statusPreCode = await main(["gate", "status", "1"], ownerEnv, (l) => statusLinesPre.push(l));
  assert.equal(statusPreCode, 0);
  const statusPre = JSON.parse(statusLinesPre.join("\n"));
  assert.equal(statusPre.readBack.lock.status, 0);
  assert.equal(statusPre.readBack.verdict.releaseWouldPass, false);

  // 5. CLI: gate lock 1 --payee <provider> --min-bond 20 --amount 2 (owner signs)
  const lockLines: string[] = [];
  const lockCode = await main(
    ["gate", "lock", "1", "--payee", providerAccount.address, "--min-bond", "20", "--amount", "2"],
    ownerEnv,
    (l) => lockLines.push(l),
  );
  assert.equal(lockCode, 0);
  const lockRecord = JSON.parse(lockLines.join("\n"));
  assert.equal(lockRecord.executed.status, "success");
  assert.equal(lockRecord.readBack.lock.status, 1);
  assert.equal(lockRecord.readBack.lock.amountTpot, "2.000000");

  // 6. CLI: gate status 1 (after lock)
  const statusLinesMid: string[] = [];
  await main(["gate", "status", "1"], ownerEnv, (l) => statusLinesMid.push(l));
  const statusMid = JSON.parse(statusLinesMid.join("\n"));
  assert.equal(statusMid.readBack.lock.status, 1);
  assert.equal(statusMid.readBack.verdict.releaseWouldPass, true);

  // 7. CLI: gate release 1 (provider signs)
  const releaseLines: string[] = [];
  const releaseCode = await main(["gate", "release", "1"], providerEnv, (l) => releaseLines.push(l));
  assert.equal(releaseCode, 0);
  const releaseRecord = JSON.parse(releaseLines.join("\n"));
  assert.equal(releaseRecord.executed.status, "success");
  assert.equal(releaseRecord.readBack.lock.status, 2); // released

  // 8. Create Deal 2 (duration 10 blocks)
  const create2Hash = await ownerWallet.writeContract({
    address: makhzanAddress,
    abi: makhzanAbi,
    functionName: "createDeal",
    args: [1, dummyRoot, 1024, 1048576, 10, 500000000000000n],
    value: 5n * 10n ** 18n,
  });
  await publicClient.waitForTransactionReceipt({ hash: create2Hash });

  // 9. CLI: gate lock 2 with minBond 30 tPOT (provider bond 24 < 30)
  const lock2Lines: string[] = [];
  const lock2Code = await main(
    ["gate", "lock", "2", "--payee", providerAccount.address, "--min-bond", "30", "--amount", "2"],
    ownerEnv,
    (l) => lock2Lines.push(l),
  );
  assert.equal(lock2Code, 0);

  // 10. CLI: gate status 2 -> releaseWouldPass: false with BondTooLow
  const status2Lines: string[] = [];
  await main(["gate", "status", "2"], ownerEnv, (l) => status2Lines.push(l));
  const status2 = JSON.parse(status2Lines.join("\n"));
  assert.equal(status2.readBack.verdict.releaseWouldPass, false);
  assert.match(status2.readBack.verdict.reason, /BondTooLow/);

  // 11. CLI: gate release 2 (fails BondTooLow without sending tx)
  const release2Lines: string[] = [];
  const release2Code = await main(["gate", "release", "2"], providerEnv, (l) => release2Lines.push(l));
  assert.equal(release2Code, 1);
  assert.match(release2Lines.join("\n"), /refusing: call would revert with BondTooLow/);

  // 12. CLI: gate refund 2 now (inside term -> fails RefundNotAllowed without sending tx)
  const refundEarlyLines: string[] = [];
  const refundEarlyCode = await main(["gate", "refund", "2"], ownerEnv, (l) => refundEarlyLines.push(l));
  assert.equal(refundEarlyCode, 1);
  assert.match(refundEarlyLines.join("\n"), /refusing: call would revert with RefundNotAllowed/);

  // 13. Advance chain past Deal 2's endBlock
  await mineBlocks(15n);

  // 14. CLI: gate refund 2 (after endBlock -> succeeds, refunding owner)
  const refundLines: string[] = [];
  const refundCode = await main(["gate", "refund", "2"], ownerEnv, (l) => refundLines.push(l));
  assert.equal(refundCode, 0);
  const refundRecord = JSON.parse(refundLines.join("\n"));
  assert.equal(refundRecord.executed.status, "success");
  assert.equal(refundRecord.readBack.lock.status, 3); // refunded

  // Gate holds 0 balance at the end
  const gateBalance = await publicClient.getBalance({ address: gateAddress });
  assert.equal(gateBalance, 0n);
});
