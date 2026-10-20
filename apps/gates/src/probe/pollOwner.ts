import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { loadEnvFile, REPO_ROOT } from "../config.ts";
import { publicClientFor } from "../lib/evm.ts";
import { connectSubstrate, systemAccount } from "../lib/substrate.ts";
import { fundingFlagText, isFunded } from "../lib/funding.ts";

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function main(): Promise<void> {
  loadEnvFile();
  const ss58 = arg("ss58");
  const evm = arg("evm") as `0x${string}`;
  const label = arg("label");
  const flagArg = process.argv.includes("--flag") ? arg("flag") : null;
  const outArg = process.argv.includes("--out") ? arg("out") : "evidence/raw/g07/05-owner-poll.txt";
  const durationArg = process.argv.includes("--duration-ms") ? Number(arg("duration-ms")) : null;
  const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 60_000);
  const durationMs = durationArg ?? Number(process.env.POLL_DURATION_MS ?? 5_400_000);
  const out = isAbsolute(outArg) ? outArg : join(REPO_ROOT, outArg);
  const flag = flagArg ? (isAbsolute(flagArg) ? flagArg : join(REPO_ROOT, flagArg)) : null;
  await mkdir(dirname(out), { recursive: true });
  if (flag) await mkdir(dirname(flag), { recursive: true });

  const rpcUrl = process.env.PORTALDOT_EVM_RPC_URL;
  const wsUrl = process.env.PORTALDOT_WS_URL;
  if (!rpcUrl || !wsUrl) throw new Error("RPC endpoints are required");

  const client = publicClientFor(rpcUrl);
  const connection = await connectSubstrate(wsUrl);
  const started = Date.now();

  await appendFile(out, `# ${label} poll started ${stamp(new Date())} ss58=${ss58} evm=${evm} interval_ms=${intervalMs} duration_ms=${durationMs} flag=${flag ?? "none"}\n`);
  let flagWritten = false;

  const poll = async (): Promise<void> => {
    const at = stamp(new Date());
    try {
      const native = await systemAccount(connection.api, ss58);
      const evmWei = (await client.getBalance({ address: evm })).toString();
      await appendFile(out, `${at} native_free=${native.free} native_reserved=${native.reserved} evm_wei=${evmWei}\n`);
      if (flag && !flagWritten && isFunded(native.free, evmWei)) {
        await writeFile(flag, fundingFlagText({ label, ss58, evm, nativeFree: native.free, evmWei, at }));
        flagWritten = true;
        await appendFile(out, `# funding flag written ${at} path=${flag}\n`);
      }
    } catch (error) {
      await appendFile(out, `${at} error=${(error as Error).name}: ${(error as Error).message}\n`);
    }
  };

  await poll();
  const timer = setInterval(() => {
    if (Date.now() - started >= durationMs) {
      clearInterval(timer);
      void connection.disconnect();
      void appendFile(out, `# poll window complete ${stamp(new Date())}\n`).then(() => process.exit(0));
      return;
    }
    void poll();
  }, intervalMs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
