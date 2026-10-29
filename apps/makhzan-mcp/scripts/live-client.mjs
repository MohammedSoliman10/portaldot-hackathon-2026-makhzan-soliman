#!/usr/bin/env node
/**
 * A scripted MCP client that talks JSON-RPC over stdio to the real server, against the live chain.
 *
 * Read-only by construction: the child process is started with a whitelisted environment (no key of
 * any kind, no gate address), and every call below is a `tools/call` on a read-only tool. Nothing in
 * this script builds a transaction.
 *
 * It fails loudly (exit 1) when a tool answers with an error, when an answer is not labelled
 * MEASURED, or when the tool list contains anything that looks like a write. The transcript it prints
 * is evidence, so a human can read exactly what the agent would have received.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SAMPLE = join(ROOT, "..", "status-ui", "public", "samples", "demo-1mib.bin");

const RPC = process.env.MAKHZAN_RPC_URL ?? "https://test-evm-rpc-v3.portaldot.dev";
const CHAIN = process.env.MAKHZAN_CHAIN_ID ?? "420420777";
const CONTRACT = process.env.MAKHZAN_CONTRACT ?? "0x60481DFcFCA34A8F095939D9675eC715127B2e44";

/**
 * The child gets PATH and HOME plus the three public settings. It does not inherit the caller's
 * environment, so a stray MAKHZAN_PRIVATE_KEY can never reach the server even by accident.
 */
const CHILD_ENV = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  MAKHZAN_RPC_URL: RPC,
  MAKHZAN_CHAIN_ID: CHAIN,
  MAKHZAN_CONTRACT: CONTRACT,
};

const failures = [];
const say = (line = "") => console.log(line);

function textOf(result) {
  return (result.content ?? []).map((part) => part.text ?? "").join("\n");
}

async function call(client, name, args) {
  say(`[request]  tools/call ${name} ${JSON.stringify(args)}`);
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    say(`[response] isError: ${textOf(result)}`);
    failures.push(`${name} ${JSON.stringify(args)} returned an error`);
    return result;
  }
  const text = textOf(result);
  say("[response]");
  for (const line of text.split("\n")) say(`  ${line}`);
  if (!text.startsWith("[MEASURED]")) failures.push(`${name} did not label its answer MEASURED`);
  say();
  return result;
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(ROOT, "src", "main.ts")],
  cwd: ROOT,
  env: CHILD_ENV,
  stderr: "pipe",
});

transport.stderr?.on("data", (chunk) => {
  // The server's one startup line goes to stderr; keep it in the transcript, prefixed.
  for (const line of String(chunk).split("\n").filter(Boolean)) say(`[server]   ${line}`);
});

const client = new Client({ name: "makhzan-live-check", version: "0.1.0" });
await client.connect(transport);

const serverInfo = client.getServerVersion();
say(`[server]   ${serverInfo?.name ?? "?"} ${serverInfo?.version ?? ""} over stdio JSON-RPC`);
say(`[client]   ${RPC} chain ${CHAIN} contract ${CONTRACT}`);
say(`[client]   sample file ${SAMPLE}`);
say();

const { tools } = await client.listTools();
say(`tools (${tools.length}):`);
for (const tool of tools) {
  const a = tool.annotations ?? {};
  say(
    `  ${tool.name}  readOnlyHint=${a.readOnlyHint} destructiveHint=${a.destructiveHint}  ` +
      `input=${JSON.stringify(tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties) : [])}`,
  );
}
if (tools.length !== 4) failures.push(`expected 4 tools, got ${tools.length}`);
for (const tool of tools) {
  if (tool.annotations?.readOnlyHint !== true) failures.push(`${tool.name} does not declare readOnlyHint`);
  if (/write|send|pay|transfer|sign|deploy|register/i.test(tool.name)) failures.push(`${tool.name} looks like a write tool`);
}
say();

for (const dealId of [1, 2]) {
  say(`=== deal ${dealId} ===`);
  await call(client, "makhzan_health", { dealId });
  await call(client, "makhzan_gate_status", { dealId });
  await call(client, "makhzan_deal_story", { dealId });
  await call(client, "makhzan_verify_file", { dealId, path: SAMPLE });
}

say("=== negative checks ===");
say("[request]  tools/call makhzan_health {\"dealId\":999}");
const missing = await client.callTool({ name: "makhzan_health", arguments: { dealId: 999 } });
say(`[response] isError=${missing.isError}: ${textOf(missing).split("\n")[0]}`);
if (missing.isError !== true) failures.push("deal 999 should not exist and should be an error");
say();
say("[request]  tools/call makhzan_write_deal {}");
const unwrite = await client.callTool({ name: "makhzan_write_deal", arguments: {} });
say(`[response] isError=${unwrite.isError}: ${textOf(unwrite).split("\n")[0]}`);
if (unwrite.isError !== true) failures.push("a write tool must not exist");
say();

await client.close();

if (failures.length > 0) {
  console.error(`live client: ${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.error("live client: all read-only calls answered, every answer labelled MEASURED");
