/** R3 anvil check: deploy, verify against the artifact, then verify a tampered copy. */
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mnemonicToAccount } from "viem/accounts";

const REPO = resolve(import.meta.dirname, "../../..");
const PORT = 8599;
const RPC = `http://127.0.0.1:${PORT}`;
const MNEMONIC = "test test test test test test test test test test test junk";
const key = `0x${Buffer.from(mnemonicToAccount(MNEMONIC).getHdKey().privateKey).toString("hex")}`;
const tmp = mkdtempSync(join(tmpdir(), "makhzan-verify-"));

function run(command, args, env, capture = false) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: REPO,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; if (!capture) process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { out += chunk; if (!capture) process.stderr.write(chunk); });
    child.on("close", (code) => resolveRun({ code, out }));
  });
}

const start = Date.now();
const anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "420420777", "--silent"], {
  stdio: ["ignore", "pipe", "pipe"],
});
anvil.stdout.on("data", () => {});
for (let i = 0; i < 100; i++) {
  const probe = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  }).catch(() => null);
  if (probe?.ok) break;
  await new Promise((r) => setTimeout(r, 100));
}

try {
  const deploy = await run("node", ["scripts/deploy.mjs"], {
    MAKHZAN_NETWORK: "local",
    MAKHZAN_RPC_URL: RPC,
    MAKHZAN_CHAIN_ID: "420420777",
    MAKHZAN_PRIVATE_KEY: key,
    MAKHZAN_EVIDENCE_DIR: join(tmp, "evidence"),
    MAKHZAN_STATE_DIR: join(tmp, "state"),
  }, true);
  const address = /deployed (0x[0-9a-fA-F]{40})/.exec(deploy.out)?.[1];
  if (deploy.code !== 0 || !address) {
    console.log(deploy.out);
    throw new Error("deploy failed");
  }
  console.log(`deployed ${address} on anvil :${PORT}`);

  const verify = await run("node", ["apps/makhzan/scripts/verify-deployment.mjs", "--address", address, "--artifact", "contracts/out/Makhzan.sol/Makhzan.json"], {
    MAKHZAN_NETWORK: "local",
    MAKHZAN_RPC_URL: RPC,
    MAKHZAN_CHAIN_ID: "420420777",
    MAKHZAN_EVIDENCE_DIR: join(tmp, "evidence"),
  });
  console.log(`verify exit=${verify.code}`);

  const artifact = JSON.parse(readFileSync(join(REPO, "contracts/out/Makhzan.sol/Makhzan.json"), "utf8"));
  const hex = artifact.deployedBytecode.object;
  const at = 2 + 100 * 2;
  const tampered = `${hex.slice(0, at)}${hex.slice(at, at + 2) === "00" ? "11" : "00"}${hex.slice(at + 2)}`;
  const tamperedPath = join(tmp, "Makhzan-tampered.json");
  writeFileSync(tamperedPath, JSON.stringify({ ...artifact, deployedBytecode: { ...artifact.deployedBytecode, object: tampered } }));
  const bad = await run("node", ["apps/makhzan/scripts/verify-deployment.mjs", "--address", address, "--artifact", tamperedPath], {
    MAKHZAN_NETWORK: "local",
    MAKHZAN_RPC_URL: RPC,
    MAKHZAN_CHAIN_ID: "420420777",
    MAKHZAN_EVIDENCE_DIR: join(tmp, "tampered-evidence"),
  });
  console.log(`tampered verify exit=${bad.code} (expected 1)`);
  mkdirSync(join(REPO, "evidence"), { recursive: true });
  copyFileSync(join(tmp, "evidence", "verify-deployment.json"), join(REPO, "evidence", "verify-deployment.local-anvil.json"));
  copyFileSync(join(tmp, "tampered-evidence", "verify-deployment.json"), join(REPO, "evidence", "verify-deployment.tampered.json"));
  console.log(`record(ok) written to evidence/verify-deployment.local-anvil.json`);
  console.log(`receipts ${readFileSync(join(tmp, "evidence", "txs.json"), "utf8").split("\n").length} lines in txs.json`);
  console.log(`[${((Date.now() - start) / 1000).toFixed(1)}s] done`);
} finally {
  anvil.kill("SIGKILL");
  rmSync(tmp, { recursive: true, force: true });
}
