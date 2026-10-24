/**
 * R5 evidence:refusals — local anvil run of the six refused actions. Read-only probes: every case is
 * an eth_call, never a transaction. Setup (register, create, challenge, resolve, settle) uses anvil's
 * public test mnemonic, passed by env to the deploy command and never printed.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, http, keccak256, parseEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { runRefusals, decodeRefusal } from "../src/refusals.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const PORT = 8600;
const RPC = `http://127.0.0.1:${PORT}`;
const MNEMONIC = "test test test test test test test test test test test junk";
const owner = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
const provider = mnemonicToAccount(MNEMONIC, { addressIndex: 1 });
const stranger = mnemonicToAccount(MNEMONIC, { addressIndex: 2 });
const keyOf = (account) => `0x${Buffer.from(account.getHdKey().privateKey).toString("hex")}`;
const tmp = mkdtempSync(join(tmpdir(), "makhzan-refusals-"));

function run(command, args, env) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { out += chunk; });
    child.on("close", (code) => resolveRun({ code, out }));
  });
}

async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "420420777", "--silent"], { stdio: ["ignore", "pipe", "pipe"] });
anvil.stdout.on("data", () => {});
for (let i = 0; i < 100; i++) {
  const probe = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) }).catch(() => null);
  if (probe?.ok) break;
  await new Promise((r) => setTimeout(r, 100));
}

const chain = defineChain({
  id: 420420777, name: "makhzan-anvil",
  nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const transport = http(RPC);
const publicClient = createPublicClient({ chain, transport });
const wallet = (account) => createWalletClient({ account, chain, transport });

try {
  const deploy = await run("node", ["scripts/deploy.mjs"], {
    MAKHZAN_NETWORK: "local", MAKHZAN_RPC_URL: RPC, MAKHZAN_CHAIN_ID: "420420777",
    MAKHZAN_PRIVATE_KEY: keyOf(owner), MAKHZAN_EVIDENCE_DIR: join(tmp, "evidence"),
    MAKHZAN_STATE_DIR: join(tmp, "state"),
  });
  const address = /deployed (0x[0-9a-fA-F]{40})/.exec(deploy.out)?.[1];
  if (deploy.code !== 0 || !address) throw new Error(`deploy failed:\n${deploy.out}`);
  const artifact = JSON.parse(readFileSync(join(REPO, "contracts/out/Makhzan.sol/Makhzan.json"), "utf8"));
  const abi = artifact.abi;
  console.log(`deployed ${address} on anvil :${PORT}`);

  const send = async (account, functionName, args, value = 0n) => {
    const hash = await wallet(account).writeContract({ address, abi, functionName, args, value });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  };

  await send(provider, "registerProvider", [], parseEther("100"));
  const price = parseEther("0.001");
  const root = keccak256(new TextEncoder().encode("makhzan-refusal-root"));
  await send(owner, "createDeal", [1, root, 1, 1024, 60, price], price * 10_000n);
  console.log("provider registered, deal 1 created");

  const emptyPath = [];
  const call = async (request) => {
    try {
      const result = await publicClient.call({
        to: request.to, data: request.data, account: request.account,
        ...(request.value ? { value: BigInt(request.value) } : {}),
      });
      return { ok: true, data: result.data };
    } catch (err) {
      let found = null;
      let cursor = err;
      for (let i = 0; i < 5 && cursor; i++) {
        if (typeof cursor.data === "string" && /^0x[0-9a-fA-F]+$/.test(cursor.data)) { found = cursor.data; break; }
        cursor = cursor.cause;
      }
      if (!found) throw new Error(`refusal call reverted without decodable data: ${err.message}`);
      return { ok: false, data: found };
    }
  };

  const nonOwner = {
    id: "non-owner-challenge",
    attempted: "challenge(1) from a stranger",
    call: { to: address, data: encodeChallenge(abi, 1), account: stranger.address },
  };

  await send(owner, "challenge", [1]);
  console.log("challenge opened on deal 1");

  const shortData = "0x00";
  const blockData = `0x${"00".repeat(1024)}`;
  const wrongLength = {
    id: "wrong-length",
    attempted: "answer(1, 1 byte, [])",
    call: { to: address, data: encodeAnswer(abi, 1, shortData, emptyPath), account: provider.address },
  };
  const wrongProof = {
    id: "wrong-proof",
    attempted: "answer(1, 1024 zero bytes, [])",
    call: { to: address, data: encodeAnswer(abi, 1, blockData, emptyPath), account: provider.address },
  };

  const first = await runRefusals([nonOwner, wrongLength, wrongProof], {
    network: "local", chainId: 420420777, utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    call: (request) => call({ to: request.to, data: request.data, account: request.account }),
    decodeError: decodeRefusal,
  });
  console.log(`decoded: ${first.entries.map((entry) => `${entry.id}=${entry.error}`).join(", ")}`);

  for (let i = 0; i < 11; i++) await rpc("evm_mine");
  const late = await runRefusals([{
    id: "late-answer",
    attempted: "answer(1, 1024 zero bytes, []) after the deadline",
    call: { to: address, data: encodeAnswer(abi, 1, blockData, emptyPath), account: provider.address },
  }], {
    network: "local", chainId: 420420777, utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    call: (request) => call({ to: request.to, data: request.data, account: request.account }),
    decodeError: decodeRefusal,
  });
  console.log(`decoded: ${late.entries.map((entry) => `${entry.id}=${entry.error}`).join(", ")}`);

  await send(stranger, "resolve", [1]);
  const deal = await publicClient.readContract({ address, abi, functionName: "dealOf", args: [1] });
  const endBlock = Number(deal[2]);
  while (Number(await rpc("eth_blockNumber")) < endBlock - 1) await rpc("evm_mine");
  // settle and challenge in the same block: AlreadySettled is only reachable while block <= endBlock.
  await rpc("evm_setAutomine", [false]);
  // sendTransaction, not writeContract: no pre-send simulation against the pending block.
  const settleHash = await wallet(owner).sendTransaction({
    to: address, data: encodeFunctionData({ abi, functionName: "settle", args: [1] }), gas: 500_000n,
  });
  const challengeHash = await wallet(owner).sendTransaction({
    to: address, data: encodeChallenge(abi, 1), gas: 500_000n,
  });
  await rpc("evm_mine");
  await rpc("evm_setAutomine", [true]);
  await publicClient.waitForTransactionReceipt({ hash: settleHash });
  await publicClient.waitForTransactionReceipt({ hash: challengeHash });
  console.log("deal 1 resolved and settled");

  const settled = await runRefusals([{
    id: "challenge-settled",
    attempted: "challenge(1) on a settled deal",
    call: { to: address, data: encodeChallenge(abi, 1), account: owner.address },
  }, {
    id: "non-multiple-value",
    attempted: "createDeal(...) with a value that is not a multiple of 10000 wei",
    call: { to: address, data: encodeCreate(abi, root, price), value: price * 10_000n + 1n, account: owner.address },
  }], {
    network: "local", chainId: 420420777, utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    call: (request) => call({ to: request.to, data: request.data, account: request.account, ...(request.value ? { value: BigInt(request.value) } : {}) }),
    decodeError: decodeRefusal,
  });
  console.log(`decoded: ${settled.entries.map((entry) => `${entry.id}=${entry.error}`).join(", ")}`);

  const record = {
    schema: "makhzan.refusals/v0",
    network: "LOCAL",
    chainId: 420420777,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    contract: address,
    entries: [...first.entries, ...late.entries, ...settled.entries],
  };
  writeFileSync(join(REPO, "evidence", "refusals.json"), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`record evidence/refusals.json with ${record.entries.length} refusals`);
} finally {
  anvil.kill("SIGKILL");
  rmSync(tmp, { recursive: true, force: true });
}

function encodeChallenge(abi, dealId) {
  return encodeCall(abi, "challenge", [dealId]);
}

function encodeAnswer(abi, dealId, data, path) {
  return encodeCall(abi, "answer", [dealId, data, path]);
}

function encodeCreate(abi, root, price) {
  return encodeCall(abi, "createDeal", [1, root, 1, 1024, 60, price]);
}

function encodeCall(abi, functionName, args) {
  return encodeFunctionData({ abi, functionName, args });
}
