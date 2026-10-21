/**
 * Local end-to-end run for Tier 1 (SC-001, SC-002).
 *
 *   anvil --chain-id 420420777 -> deploy Makhzan -> register a provider -> upload a 1 MiB file ->
 *   create a deal -> one challenge answered correctly (pass) -> one challenge skipped on purpose,
 *   resolved after the window (slash) -> settle.
 *
 * LOCAL ONLY. The three accounts are derived at run time from anvil's public default mnemonic (or
 * MAKHZAN_ANVIL_MNEMONIC if set); no key is printed, written or committed, and the chain id is
 * asserted before anything is sent.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  bytesToHex, createPublicClient, createWalletClient, decodeEventLog, encodeDeployData, http,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { chunkFile } from "../src/chunk.ts";
import { buildTree, getPath } from "../src/merkle.ts";
import { UploadReceiver } from "../src/upload.ts";
import { pollOnce } from "../src/daemon.ts";
import { blockPathFor, emptyState, writeState } from "../src/state.ts";

const CHAIN_ID = 420420777;
const PORT = 8549;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN = {
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};
// anvil's public default mnemonic: a documented test fixture funded only on the local chain.
const MNEMONIC = process.env.MAKHZAN_ANVIL_MNEMONIC ?? "test test test test test test test test test test test junk";

const WINDOW = 10;
const BLOCK_SIZE = 1024;
const SLASH_BPS = 2000n;
const MIN_BOND_UNITS = 10n ** 16n; // 100 tPOT
const DURATION = 50;
const PRICE_UNITS = 10n ** 15n; // 10 tPOT
const WEI = 10_000n;
const FILE_SIZE = 1024 * 1024;

const round = (name) => console.log(`\n== ${name} ==`);
const say = (msg) => console.log(msg);

function fileBytes(size) {
  const out = new Uint8Array(size);
  let x = 0x12345678;
  for (let i = 0; i < size; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out[i] = (x >>> 16) & 0xff;
  }
  return out;
}

async function waitForRpc(client, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      await client.getChainId();
      return;
    } catch {
      if (Date.now() > until) throw new Error("anvil did not start within 30s");
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

const stateDir = mkdtempSync(join(tmpdir(), "makhzan-e2e-"));
const stateFile = join(stateDir, "state.json");
const anvil = spawn("anvil", ["--chain-id", String(CHAIN_ID), "--port", String(PORT), "--silent"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
anvil.stderr.on("data", (c) => {
  stderr += c.toString();
});

const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC) });
const accounts = [
  mnemonicToAccount(MNEMONIC, { addressIndex: 0 }),
  mnemonicToAccount(MNEMONIC, { addressIndex: 1 }),
  mnemonicToAccount(MNEMONIC, { addressIndex: 2 }),
];
const [owner, provider, stranger] = accounts;
const wallet = (account) => createWalletClient({ account, chain: CHAIN, transport: http(RPC) });

const rounds = [];

try {
  await waitForRpc(publicClient);
  const chainId = await publicClient.getChainId();
  assert.equal(chainId, CHAIN_ID, "chain id");
  say(`chain id ${chainId} on ${RPC} (local anvil)`);

  const artifact = JSON.parse(
    readFileSync(new URL("../../../contracts/out/Makhzan.sol/Makhzan.json", import.meta.url), "utf8"),
  );
  const abi = artifact.abi;
  const deployData = encodeDeployData({
    abi,
    bytecode: artifact.bytecode.object,
    args: [WINDOW, BLOCK_SIZE, Number(SLASH_BPS), MIN_BOND_UNITS, 10, 1000],
  });
  const readFn = (functionName, args = []) =>
    publicClient.readContract({ address: makhzan, abi, functionName, args });

  round("deploy");
  const deployHash = await wallet(owner).sendTransaction({ data: deployData });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  assert.equal(deployReceipt.status, "success", "deploy");
  const makhzan = deployReceipt.contractAddress;
  assert.ok(makhzan, "deploy address");
  say(`Makhzan deployed at ${makhzan} (tx ${deployHash})`);

  async function send(account, functionName, args = [], value = 0n) {
    const hash = await wallet(account).writeContract({ address: makhzan, abi, functionName, args, value });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", `${functionName} reverted`);
    return { hash, receipt };
  }

  round("register provider");
  const registered = await send(provider, "registerProvider", [], MIN_BOND_UNITS * WEI);
  const [providerId, bond, activeDeals, isRegistered] = await readFn("providerOf", [provider.address]);
  assert.equal(Number(providerId), 1, "provider id 1");
  assert.equal(bond, MIN_BOND_UNITS, "bond in units");
  assert.equal(Number(activeDeals), 0);
  assert.equal(isRegistered, true);
  say(`provider ${provider.address} id=${providerId} bond=${bond} units (tx ${registered.hash})`);

  round("chunk, build and upload 1 MiB");
  const bytes = fileBytes(FILE_SIZE);
  const chunked = chunkFile(bytes, BLOCK_SIZE);
  const tree = buildTree(chunked.blocks);
  assert.equal(chunked.leafCount, 1024);
  const receiver = new UploadReceiver({ blockSize: BLOCK_SIZE, storeDir: join(stateDir, "files") });
  let ack;
  for (let i = 0; i < chunked.leafCount; i++) {
    ack = receiver.accept({
      root: tree.root,
      size: chunked.size,
      leafCount: chunked.leafCount,
      blockSize: BLOCK_SIZE,
      index: i,
      data: bytesToHex(chunked.blocks[i]),
    });
  }
  assert.deepEqual(ack, { root: tree.root, size: FILE_SIZE, leafCount: 1024 });
  say(`root ${tree.root} size ${FILE_SIZE} leafCount ${ack.leafCount} acknowledged`);

  round("create deal");
  const created = await send(
    owner, "createDeal",
    [providerId, tree.root, chunked.leafCount, chunked.size, DURATION, PRICE_UNITS],
    PRICE_UNITS * WEI,
  );
  const createdLog = created.receipt.logs.find((log) => {
    try {
      return decodeEventLog({ abi, data: log.data, topics: log.topics }).eventName === "DealCreated";
    } catch {
      return false;
    }
  });
  assert.ok(createdLog, "DealCreated event");
  const dealId = Number(decodeEventLog({ abi, data: createdLog.data, topics: createdLog.topics }).args.dealId);
  const deal = await readFn("dealOf", [dealId]);
  const endBlock = Number(deal[2]);
  say(`deal ${dealId} created, owner ${owner.address}, end block ${endBlock} (tx ${created.hash})`);

  const state = emptyState(CHAIN_ID, Number(providerId));
  state.files[tree.root] = { size: FILE_SIZE, leafCount: chunked.leafCount, path: `.state/files/${tree.root}` };
  state.deals[String(dealId)] = {
    role: "provider", owner: owner.address, providerId: Number(providerId), root: tree.root,
  };
  writeState(stateFile, state);
  for (let i = 0; i < chunked.leafCount; i++) {
    assert.ok(readFileSync(blockPathFor(stateFile, tree.root, i)).length > 0);
  }

  round("challenge 1 - answered (expected pass)");
  const ch1 = await send(owner, "challenge", [dealId]);
  const cs1 = await readFn("challengeStateOf", [dealId]);
  const index1 = Number(cs1[1]);
  const answer1 = await send(provider, "answer", [dealId, bytesToHex(chunked.blocks[index1]), getPath(tree, index1)]);
  const cs1After = await readFn("challengeStateOf", [dealId]);
  assert.equal(cs1After[0], false, "challenge 1 resolved by a valid answer");
  const bondAfterPass = (await readFn("providerOf", [provider.address]))[1];
  assert.equal(bondAfterPass, MIN_BOND_UNITS, "a pass does not touch the bond");
  rounds.push({
    outcome: "passed", dealId, index: index1, pathLength: getPath(tree, index1).length,
    challengeTx: ch1.hash, answerTx: answer1.hash, bondAfter: bondAfterPass.toString(),
  });
  say(`index ${index1}, path length ${getPath(tree, index1).length}, answer ${answer1.hash}, bond unchanged`);

  round("challenge 2 - skipped on purpose (expected slash)");
  const ch2 = await send(owner, "challenge", [dealId]);
  const daemonClient = {
    async challengeStateOf(id) {
      const [open, index, start, deadline, expected] = await readFn("challengeStateOf", [id]);
      return {
        open, index: Number(index), start: Number(start), deadline: Number(deadline),
        expectedPathLength: Number(expected),
      };
    },
    async answer(id, data, path) {
      const hash = await wallet(provider).writeContract({ address: makhzan, abi, functionName: "answer", args: [id, data, path] });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("answer reverted");
      return { hash };
    },
  };
  const polled = await pollOnce({ client: daemonClient, state, stateFile, drill: "skip" });
  assert.deepEqual(polled.skipped, [dealId], "the daemon skipped the answer");
  const index2 = state.deals[String(dealId)].lastChallenge.index;

  const bondBefore = (await readFn("providerOf", [provider.address]))[1];
  const ownerBefore = await publicClient.getBalance({ address: owner.address });
  await publicClient.request({ method: "anvil_mine", params: [`0x${(WINDOW + 1).toString(16)}`, "0x0"] });
  const resolved = await send(stranger, "resolve", [dealId]);
  const bondAfter = (await readFn("providerOf", [provider.address]))[1];
  const ownerAfter = await publicClient.getBalance({ address: owner.address });
  const slashed = bondBefore - bondAfter;
  assert.equal(slashed, (bondBefore * SLASH_BPS) / 10_000n, "slash is exactly 20% of the bond");
  assert.equal(ownerAfter - ownerBefore, slashed * WEI, "the owner was credited the slash");
  rounds.push({
    outcome: "slashed", dealId, index: index2, skipped: true,
    challengeTx: ch2.hash, resolveTx: resolved.hash,
    bondBefore: bondBefore.toString(), bondAfter: bondAfter.toString(), slashed: slashed.toString(),
    ownerCreditWei: (ownerAfter - ownerBefore).toString(),
  });
  say(`index ${index2}, slash ${slashed} units, owner credited ${ownerAfter - ownerBefore} wei`);

  round("settle");
  const current = await publicClient.getBlockNumber();
  if (BigInt(endBlock) > current) {
    await publicClient.request({ method: "anvil_mine", params: [`0x${(BigInt(endBlock) - current).toString(16)}`, "0x0"] });
  }
  const providerBefore = await publicClient.getBalance({ address: provider.address });
  const settled = await send(stranger, "settle", [dealId]);
  const providerAfter = await publicClient.getBalance({ address: provider.address });
  const dealAfter = await readFn("dealOf", [dealId]);
  const accrued = await readFn("accruedOf", [dealId]);
  assert.equal(dealAfter[10], PRICE_UNITS, "claimed becomes the whole price");
  assert.equal(Number(dealAfter[4]) & 1, 1, "settled flag");
  assert.equal(accrued[0], PRICE_UNITS);
  assert.equal(accrued[1], 0n, "nothing left to claim");
  assert.equal(providerAfter - providerBefore, PRICE_UNITS * WEI, "provider received the price");
  say(`settle tx ${settled.hash}; provider +${providerAfter - providerBefore} wei; claimed ${dealAfter[10]}`);

  round("summary");
  const summary = {
    chainId,
    rpc: RPC,
    makhzan,
    dealId,
    providerId: Number(providerId),
    root: tree.root,
    size: FILE_SIZE,
    leafCount: chunked.leafCount,
    blockSize: BLOCK_SIZE,
    priceUnits: PRICE_UNITS.toString(),
    minBondUnits: MIN_BOND_UNITS.toString(),
    slashBps: SLASH_BPS.toString(),
    rounds,
  };
  console.log(JSON.stringify({ tier1LocalRun: summary }, null, 2));
  say("\nPASS — SC-001 (one passed challenge) and SC-002 (one slashed challenge) on local anvil");
} catch (err) {
  console.error("\nFAIL —", err?.stack ?? err);
  process.exitCode = 1;
} finally {
  anvil.kill("SIGTERM");
  rmSync(stateDir, { recursive: true, force: true });
  if (process.exitCode) {
    const tail = stderr.split("\n").slice(-8).join("\n");
    if (tail.trim()) console.error("anvil stderr tail:\n" + tail);
  }
}
