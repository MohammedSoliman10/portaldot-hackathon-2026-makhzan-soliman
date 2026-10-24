/**
 * Process-level end-to-end on local anvil.
 *
 * Separate OS processes: anvil, the deploy command, the daemon, and the CLI for every command.
 * Happy path: register -> upload -> create -> challenge -> daemon answers -> watch -> claim -> settle.
 * Failure drill: a second deal with the daemon in `skip` mode, then `resolve` after the deadline; the
 * bond is slashed by exactly 20% and the owner is credited exactly that amount.
 *
 * Local only. The key is anvil's public test mnemonic, derived here and passed through the child
 * environment; it is never printed and never written to a file.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(APP));
const PORT = 8564;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 420_420_777;
const DAEMON_PORT = 8588;
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;
const MNEMONIC = "test test test test test test test test test test test junk";
const WEI_PER_UNIT = 10_000n;
const WINDOW = 10;
const SLASH_BPS = 2000;
const FILE_SIZE = 8 * 1024;
const BLOCK_SIZE = 1024;

const owner = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
const provider = mnemonicToAccount(MNEMONIC, { addressIndex: 1 });
const keyOf = (account) => `0x${Buffer.from(account.getHdKey().privateKey).toString("hex")}`;

const publicClient = createPublicClient({ transport: http(RPC) });
const children = [];
const started = Date.now();
const stateDir = mkdtempSync(join(tmpdir(), "makhzan-e2e-"));
const deployment = join(stateDir, "deployment.json");
const file = join(stateDir, "payload.bin");

function say(line) {
  console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

async function waitFor(check, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function mine(blocks) {
  await rpc("anvil_mine", [`0x${blocks.toString(16)}`]);
}

function envFor(keyHex, extra = {}) {
  return {
    ...process.env,
    MAKHZAN_NETWORK: "local",
    MAKHZAN_RPC_URL: RPC,
    MAKHZAN_CHAIN_ID: String(CHAIN_ID),
    MAKHZAN_CONTRACT: contract,
    MAKHZAN_PRIVATE_KEY: keyHex,
    MAKHZAN_STATE_DIR: stateDir,
    MAKHZAN_DAEMON_PORT: String(DAEMON_PORT),
    MAKHZAN_POLL_MS: "400",
    MAKHZAN_BLOCK_SIZE: String(BLOCK_SIZE),
    ...extra,
  };
}

function spawnChild(name, command, args, options = {}) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}!] ${chunk}`));
  child.on("exit", (code, signal) => say(`${name} exited code=${code} signal=${signal ?? ""}`));
  children.push(child);
  return child;
}

function runChild(name, command, args, env) {
  return new Promise((resolve) => {
    const child = spawnChild(name, command, args, { cwd: APP, env });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("exit", (code) => resolve({ code, out }));
  });
}

function runCli(args, keyHex) {
  return runChild(`cli ${args[0]}`, process.execPath, [join(APP, "src/cliMain.ts"), ...args], envFor(keyHex));
}

async function cli(args, keyHex) {
  const { code, out } = await runCli(args, keyHex);
  if (code !== 0) throw new Error(`cli ${args.join(" ")} failed: ${out}`);
  const start = out.indexOf("{");
  if (start < 0) throw new Error(`cli ${args.join(" ")} printed no record: ${out}`);
  return JSON.parse(out.slice(start));
}

async function daemonProcess(mode) {
  const child = spawn(
    process.execPath,
    [join(APP, "src/daemonMain.ts")],
    { cwd: APP, env: envFor(keyOf(provider), { MAKHZAN_PROVIDER_ID: "1", ...(mode ? { MAKHZAN_DRILL: mode } : {}) }) },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(`[daemon] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => process.stderr.write(`[daemon!] ${chunk}`));
  children.push(child);
  await waitFor(async () => {
    await fetch(`${DAEMON_URL}/upload`, { method: "GET" });
    return true;
  }, "daemon port");
  return {
    child,
    output: () => output,
    async stop() {
      child.kill("SIGTERM");
      const code = await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(() => resolve(-1), 10_000);
      });
      assert(code === 0, `daemon stopped cleanly (got ${code})`);
      return output;
    },
  };
}

let contract;
try {
  say("start anvil");
  spawnChild("anvil", "anvil", ["--chain-id", String(CHAIN_ID), "--port", String(PORT), "--silent"]);
  await waitFor(async () => (await publicClient.getBlockNumber()) >= 0n, "anvil");

  say("deploy via scripts/deploy.mjs (separate process)");
  const deployed = await runChild("deploy", process.execPath, [join(REPO, "scripts/deploy.mjs"), "--out", deployment, "--window", String(WINDOW), "--block-size", String(BLOCK_SIZE), "--slash-bps", String(SLASH_BPS)], envFor(keyOf(owner)));
  assert(deployed.code === 0, "deploy exit code 0");
  const record = JSON.parse(readFileSync(deployment, "utf8"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const keptRecord = join(REPO, "evidence", "deployments", `local-e2e-process-${stamp}.json`);
  mkdirSync(dirname(keptRecord), { recursive: true });
  writeFileSync(keptRecord, `${JSON.stringify(record, null, 2)}\n`);
  contract = record.address;
  say(`contract ${contract} tx ${record.txHash} runtime ${record.runtimeBytes} B`);
  assert(record.runtimeBytes > 0, "deployed runtime measured");
  assert(record.constructor.challengeWindowBlocks === WINDOW, "constructor window read back");

  say("register provider (setup, viem)");
  const abi = [
    { type: "function", name: "registerProvider", stateMutability: "payable", inputs: [], outputs: [] },
    { type: "function", name: "providerOf", stateMutability: "view", inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint16" }, { type: "uint64" }, { type: "uint24" }, { type: "bool" }] },
    { type: "function", name: "dealOf", stateMutability: "view", inputs: [{ name: "dealId", type: "uint32" }], outputs: [{ type: "address" }, { type: "uint32" }, { type: "uint32" }, { type: "uint16" }, { type: "uint8" }, { type: "bytes32" }, { type: "uint24" }, { type: "uint32" }, { type: "uint32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint64" }] },
  ];
  const wallet = createWalletClient({ account: provider, transport: http(RPC) });
  const bondUnits = BigInt(record.constructor.minBondUnits);
  const registerHash = await wallet.writeContract({
    address: contract, abi, functionName: "registerProvider", args: [], value: bondUnits * WEI_PER_UNIT,
  });
  await publicClient.waitForTransactionReceipt({ hash: registerHash });
  const [providerId, bondBefore0] = await publicClient.readContract({ address: contract, abi, functionName: "providerOf", args: [provider.address] });
  assert(Number(providerId) === 1, "provider id 1");
  assert(bondBefore0 === bondUnits, "bond in units");
  say(`provider 1 registered, bond ${bondBefore0} units`);

  writeFileSync(file, Buffer.alloc(FILE_SIZE, 0x5a));

  say("daemon (answer mode) as a separate process");
  let daemon = await daemonProcess();

  say("cli upload");
  const uploaded = await cli(["upload", file, "--provider", "1"], keyOf(owner));
  const { root, size, leafCount } = uploaded.readBack;
  say(`root ${root} size ${size} leafCount ${leafCount}`);

  say("cli create");
  const created = await cli(["create", "--root", root, "--size", String(size), "--leaf-count", String(leafCount), "--provider", "1", "--duration", "20", "--price", "100"], keyOf(owner));
  const deal1 = created.readBack.dealId;
  say(`deal ${deal1} created, end block ${created.readBack.endBlock}`);

  say("cli challenge");
  await cli(["challenge", String(deal1)], keyOf(owner));

  say("cli watch (waits for the daemon answer)");
  const watched = await cli(["watch", String(deal1)], keyOf(owner));
  assert(watched.readBack.challenge.open === false, "challenge closed by the answer");
  assert(watched.readBack.claimed !== undefined, "read-back present");

  say("cli claim (provider)");
  await mine(3);
  const claimed = await cli(["claim", String(deal1)], keyOf(provider));
  assert(BigInt(claimed.readBack.claimed) > 0n, "provider claimed accrued payment");

  say("advance to the deal end and cli settle");
  const dealState = await publicClient.readContract({ address: contract, abi, functionName: "dealOf", args: [deal1] });
  const endBlock = Number(dealState[2]);
  const now = Number(await publicClient.getBlockNumber());
  if (now <= endBlock) await mine(endBlock - now + 1);
  const settled = await cli(["settle", String(deal1)], keyOf(owner));
  assert((Number(settled.readBack.flags) & 1) === 1, "deal settled");

  const firstRun = await daemon.stop();
  assert(/daemon stopped/.test(firstRun), "daemon logged a graceful stop");
  assert(/submitted=\[1\]/.test(firstRun), "daemon logged the submitted state");
  assert(/passed=\[1\]/.test(firstRun) || /skipped=\[1\]/.test(firstRun), "daemon logged a resolution label");
  say("daemon stopped gracefully after the happy path");

  say("daemon (skip drill) as a separate process");
  daemon = await daemonProcess("skip");

  say("cli create + challenge for the drill");
  const created2 = await cli(["create", "--root", root, "--size", String(size), "--leaf-count", String(leafCount), "--provider", "1", "--duration", "20", "--price", "50"], keyOf(owner));
  const deal2 = created2.readBack.dealId;
  await cli(["challenge", String(deal2)], keyOf(owner));
  say("wait for the daemon to log the skip drill");
  await waitFor(() => /skipped=\[2\]/.test(daemon.output()), "daemon skip label", 15_000);

  say(`advance past the ${WINDOW}-block window`);
  await mine(WINDOW + 1);

  const [, bondBefore] = await publicClient.readContract({ address: contract, abi, functionName: "providerOf", args: [provider.address] });
  const ownerBefore = await publicClient.getBalance({ address: owner.address });
  say("cli resolve (provider pays the gas, owner is credited exactly)");
  const resolved = await cli(["resolve", String(deal2)], keyOf(provider));
  assert(resolved.readBack.challenge.open === false, "resolve closed the challenge");
  const [, bondAfter] = await publicClient.readContract({ address: contract, abi, functionName: "providerOf", args: [provider.address] });
  const ownerAfter = await publicClient.getBalance({ address: owner.address });
  const slashed = bondBefore - bondAfter;
  const credit = ownerAfter - ownerBefore;
  say(`bond ${bondBefore} -> ${bondAfter} units, slashed ${slashed}, owner credited ${credit} wei`);
  assert(slashed * 10_000n === bondBefore * BigInt(SLASH_BPS), "slash is exactly 20% of the bond");
  assert(credit === slashed * WEI_PER_UNIT, "owner credited exactly the slash in wei");

  say("advance past the drill deal end and settle");
  const deal2State = await publicClient.readContract({ address: contract, abi, functionName: "dealOf", args: [deal2] });
  const end2 = Number(deal2State[2]);
  const now2 = Number(await publicClient.getBlockNumber());
  if (now2 <= end2) await mine(end2 - now2 + 1);
  const settled2 = await cli(["settle", String(deal2)], keyOf(owner));
  assert((Number(settled2.readBack.flags) & 1) === 1, "drill deal settled");

  const secondRun = await daemon.stop();
  assert(/skipped=\[2\]/.test(secondRun), "daemon logged the skipped drill deal");
  say("daemon stopped gracefully after the drill");

  console.log(JSON.stringify({
    ok: true,
    contract,
    deploymentRecord: keptRecord,
    deal1,
    deal2,
    slashed: slashed.toString(),
    creditWei: credit.toString(),
    bondBefore: bondBefore.toString(),
    bondAfter: bondAfter.toString(),
  }));
  say("PASS");
  process.exitCode = 0;
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
} finally {
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  rmSync(stateDir, { recursive: true, force: true });
}
