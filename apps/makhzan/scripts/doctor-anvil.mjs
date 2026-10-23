/** R6 anvil check: doctor before deploy, after deploy, and after provider registration. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, parseEther } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const REPO = resolve(import.meta.dirname, "../../..");
const PORT = 8601;
const RPC = `http://127.0.0.1:${PORT}`;
const MNEMONIC = "test test test test test test test test test test test junk";
const owner = mnemonicToAccount(MNEMONIC);
const key = `0x${Buffer.from(owner.getHdKey().privateKey).toString("hex")}`;
const tmp = mkdtempSync(join(tmpdir(), "makhzan-doctor-"));

function run(command, args, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { out += chunk; });
    child.on("close", (code) => resolveRun({ code, out }));
  });
}

const anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "420420777", "--silent"], { stdio: ["ignore", "pipe", "pipe"] });
anvil.stdout.on("data", () => {});
for (let i = 0; i < 100; i++) {
  const probe = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) }).catch(() => null);
  if (probe?.ok) break;
  await new Promise((r) => setTimeout(r, 100));
}

const doctor = (contract) => run("node", ["apps/makhzan/src/doctorMain.ts", "--account", owner.address, "--contract", contract], {
  MAKHZAN_NETWORK: "local", MAKHZAN_RPC_URL: RPC, MAKHZAN_CHAIN_ID: "420420777",
});

try {
  const before = await doctor("");
  console.log("== before deploy ==");
  console.log(before.out.trim());
  console.log(`exit=${before.code} (expected 1)`);

  const deploy = await run("node", ["scripts/deploy.mjs"], {
    MAKHZAN_NETWORK: "local", MAKHZAN_RPC_URL: RPC, MAKHZAN_CHAIN_ID: "420420777",
    MAKHZAN_PRIVATE_KEY: key, MAKHZAN_EVIDENCE_DIR: join(tmp, "evidence"), MAKHZAN_STATE_DIR: join(tmp, "state"),
  });
  const address = /deployed (0x[0-9a-fA-F]{40})/.exec(deploy.out)?.[1];
  if (!address) throw new Error(`deploy failed:\n${deploy.out}`);

  const middle = await doctor(address);
  console.log("== after deploy, before register ==");
  console.log(middle.out.trim());
  console.log(`exit=${middle.code} (expected 1: account mapping)`);

  const chain = defineChain({
    id: 420420777, name: "makhzan-anvil",
    nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  });
  const wallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
  const hash = await wallet.writeContract({
    address,
    abi: [{ type: "function", name: "registerProvider", stateMutability: "payable", inputs: [], outputs: [] }],
    functionName: "registerProvider",
    value: parseEther("100"),
  });
  await createPublicClient({ chain, transport: http(RPC) }).waitForTransactionReceipt({ hash });

  const after = await doctor(address);
  console.log("== after register ==");
  console.log(after.out.trim());
  console.log(`exit=${after.code} (expected 0)`);
} finally {
  anvil.kill("SIGKILL");
  rmSync(tmp, { recursive: true, force: true });
}
