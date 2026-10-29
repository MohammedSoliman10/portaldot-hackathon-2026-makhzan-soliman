import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { chunkFile } from "../../makhzan/src/chunk.ts";
import { buildTree } from "../../makhzan/src/merkle.ts";
import { createServer } from "../src/server.ts";
import { CONTRACT, GATE, fakeReads, storyInput } from "./helpers.ts";

const NAMES = ["makhzan_deal_story", "makhzan_gate_status", "makhzan_health", "makhzan_verify_file"];

async function connect(reads = fakeReads(), gate: string | null = null, verifyDir = process.cwd()) {
  const server = createServer({
    reads,
    story: { input: async () => storyInput() },
    contract: CONTRACT,
    gate: gate as `0x${string}` | null,
    verifyDir,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

const textOf = (result: unknown): string => {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((part) => part.text ?? "").join("\n");
};

test("the server exposes exactly four read-only tools and no write tool", async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();

  assert.deepEqual(tools.map((tool) => tool.name).sort(), NAMES);
  for (const tool of tools) {
    assert.match(tool.description ?? "", /read-only/i, `${tool.name} must say it is read-only`);
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must carry readOnlyHint`);
    assert.doesNotMatch(tool.name, /write|send|pay|transfer|sign|deploy|register/i);
  }
  await client.close();
});

test("makhzan_health answers over JSON-RPC with a MEASURED block", async () => {
  const { client } = await connect();
  const result = await client.callTool({ name: "makhzan_health", arguments: { dealId: 1 } });
  const text = textOf(result);

  assert.match(text, /^\[MEASURED\] makhzan_health — deal 1/);
  assert.match(text, /healthOf 1/);
  assert.equal((result as { isError?: boolean }).isError, undefined);
  await client.close();
});

test("makhzan_gate_status says gate not deployed with no address configured", async () => {
  const { client } = await connect(fakeReads(), null);
  const text = textOf(await client.callTool({ name: "makhzan_gate_status", arguments: { dealId: 2 } }));
  assert.match(text, /gate not deployed/);
  await client.close();
});

test("makhzan_gate_status uses the configured gate when there is one", async () => {
  const { client } = await connect(fakeReads(), GATE);
  const text = textOf(await client.callTool({ name: "makhzan_gate_status", arguments: { dealId: 1 } }));
  assert.match(text, /gate 0x1111111111111111111111111111111111111111/);
  assert.match(text, /release would pass now: YES/);
  await client.close();
});

test("makhzan_verify_file verifies a real file over JSON-RPC and names a mismatch", async () => {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-mcp-server-"));
  try {
    const bytes = new Uint8Array(2048);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
    const path = join(dir, "file.bin");
    const reference = join(dir, "original.bin");
    writeFileSync(path, bytes);
    writeFileSync(reference, bytes);
    const tree = buildTree(chunkFile(bytes, 1024).blocks);
    const reads = fakeReads({
      deal: async (id) => ({
        id,
        owner: "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
        startBlock: 1,
        endBlock: 100,
        providerId: 1,
        flags: 0,
        root: tree.root,
        leafCount: 2,
        size: 2048,
        price: 0n,
        claimed: 0n,
      }),
    });
    const { client } = await connect(reads, null, dir);
    const good = textOf(await client.callTool({ name: "makhzan_verify_file", arguments: { dealId: 1, path } }));
    assert.match(good, /MATCH/);

    bytes[1024] ^= 0xff;
    writeFileSync(path, bytes);
    const bad = textOf(
      await client.callTool({ name: "makhzan_verify_file", arguments: { dealId: 1, path, referencePath: reference } }),
    );
    assert.match(bad, /MISMATCH/);
    assert.match(bad, /first block that does not match the committed root: 1/);
    await client.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failing read is returned as an MCP error, not as a fabricated verdict", async () => {
  const reads = fakeReads({
    deal: async () => {
      throw new Error("deal 9 does not exist on 0x6048 (owner is the zero address)");
    },
  });
  const { client } = await connect(reads);
  const result = (await client.callTool({ name: "makhzan_health", arguments: { dealId: 9 } })) as {
    isError?: boolean;
    content: { text?: string }[];
  };

  assert.equal(result.isError, true);
  assert.match(result.content.map((part) => part.text).join("\n"), /does not exist/);
  assert.doesNotMatch(result.content.map((part) => part.text).join("\n"), /\[MEASURED\]/);
  await client.close();
});

test("an unknown tool is refused, and the refusal is not a verdict", async () => {
  const { client } = await connect();
  const result = (await client.callTool({ name: "makhzan_write_deal", arguments: {} })) as {
    isError?: boolean;
    content: { text?: string }[];
  };
  assert.equal(result.isError, true);
  assert.match(result.content.map((part) => part.text).join("\n"), /not found|unknown|invalid/i);
  await client.close();
});

test("makhzan_verify_file refuses a file outside MAKHZAN_VERIFY_DIR over JSON-RPC", async () => {
  const dir = mkdtempSync(join(tmpdir(), "makhzan-mcp-scope-"));
  const outside = mkdtempSync(join(tmpdir(), "makhzan-outside-"));
  try {
    const escaped = join(outside, "escape.bin");
    writeFileSync(escaped, new Uint8Array(2048));
    const { client } = await connect(fakeReads(), null, dir);
    const result = (await client.callTool({
      name: "makhzan_verify_file",
      arguments: { dealId: 1, path: escaped },
    })) as { isError?: boolean; content: { text?: string }[] };
    assert.equal(result.isError, true);
    const text = result.content.map((part) => part.text ?? "").join("\n");
    assert.match(text, /outside/);
    assert.match(text, /MAKHZAN_VERIFY_DIR/);
    assert.doesNotMatch(text, /\[MEASURED\]/);
    await client.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
