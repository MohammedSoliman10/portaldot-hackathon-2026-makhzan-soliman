/**
 * The MCP server: four tools, none of which can change anything.
 *
 * `createServer` takes the reads it should use, so the unit tests drive the exact tool code over an
 * in-memory transport with a fake node. The only production wiring is `src/main.ts`.
 *
 * Every tool carries `readOnlyHint: true` and `destructiveHint: false`, and the names are checked by
 * a test against a write-ish pattern: an agent should be able to tell from the tool list alone that
 * this server cannot move funds.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Hex } from "viem";
import type { Reads } from "./reads.ts";
import { gateStatusTool } from "./tools/gate.ts";
import { healthTool } from "./tools/health.ts";
import { storyTool, type StorySource } from "./tools/story.ts";
import { verifyFileTool } from "./tools/verifyFile.ts";

export const SERVER_NAME = "makhzan";
export const SERVER_VERSION = "0.1.0";

export const TOOL_NAMES = [
  "makhzan_health",
  "makhzan_verify_file",
  "makhzan_deal_story",
  "makhzan_gate_status",
] as const;

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const dealId = z.number().int().positive().describe("Makhzan deal id, for example 1");

export interface ServerDeps {
  reads: Reads;
  story: StorySource;
  contract: Hex;
  gate: Hex | null;
  blockSize?: number;
  /** Folder `verify_file` may read; defaults to the working directory, like `loadConfig`. */
  verifyDir?: string;
}

export function createServer(deps: ServerDeps): McpServer {
  const blockSize = deps.blockSize ?? 1024;
  const verifyDir = deps.verifyDir ?? process.cwd();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Read-only Makhzan tools: deal health, local file verification, deal history and StorageGate " +
        "status. Every answer is labelled MEASURED and comes from the chain this server was started " +
        "against. There is no tool here that sends a transaction, signs anything or spends funds.",
    },
  );

  const reply = (text: string, facts: Record<string, unknown>) => ({
    content: [{ type: "text" as const, text }],
    structuredContent: facts,
  });

  server.registerTool(
    "makhzan_health",
    {
      title: "Makhzan deal health (read-only)",
      description:
        "Read-only. Returns healthOf, the end block, how many blocks the deal has left, and the " +
        "MakhzanGuard decision (healthy / pending / default / settled-or-none / expired) that decides " +
        "whether a consumer may release a payment.",
      inputSchema: { dealId },
      annotations: READ_ONLY,
    },
    async ({ dealId: id }) => {
      const result = await healthTool(deps.reads, id, { contract: deps.contract });
      return reply(result.text, result.facts);
    },
  );

  server.registerTool(
    "makhzan_verify_file",
    {
      title: "Verify a local file against a deal (read-only)",
      description:
        "Read-only. Hashes a local file into the deal's 1 KiB blocks, rebuilds the Merkle root and " +
        "compares it with the root the chain holds. Says MATCH or MISMATCH; the file is never uploaded " +
        "and no transaction is built. Only files under MAKHZAN_VERIFY_DIR can be read, and a relative " +
        "path is relative to that folder.",
      inputSchema: {
        dealId,
        path: z
          .string()
          .min(1)
          .describe(
            "Path to the file, under MAKHZAN_VERIFY_DIR (a relative path is relative to that folder). " +
              "Anything outside it is refused, including ../ and symlinks that point out.",
          ),
        referencePath: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional second copy that is known to match the deal. With it, a mismatch names the first differing block; " +
              "without it the chain alone cannot localise a difference.",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ dealId: id, path, referencePath }) => {
      const result = await verifyFileTool(
        deps.reads,
        { dealId: id, path, referencePath },
        { contract: deps.contract, blockSize, verifyDir },
      );
      return reply(result.text, result.facts);
    },
  );

  server.registerTool(
    "makhzan_deal_story",
    {
      title: "Makhzan deal history (read-only)",
      description:
        "Read-only. Rebuilds one deal's history from its on-chain events (created, challenge opened, " +
        "answered, slashed, claimed, settled) and returns the same PASS/FAIL check list the Makhzan CLI " +
        "prints, with RESULT PASS, FAIL or INCOMPLETE.",
      inputSchema: { dealId },
      annotations: READ_ONLY,
    },
    async ({ dealId: id }) => {
      const result = await storyTool(deps.story, id, { contract: deps.contract });
      return reply(result.text, result.facts);
    },
  );

  server.registerTool(
    "makhzan_gate_status",
    {
      title: "StorageGate lock and release verdict (read-only)",
      description:
        "Read-only. Returns the StorageGate lock for a deal (payer, payee, amount, minBond), the " +
        "payee's provider bond, and whether release would pass right now. If no gate address is " +
        "configured it answers 'gate not deployed' and invents nothing.",
      inputSchema: { dealId },
      annotations: READ_ONLY,
    },
    async ({ dealId: id }) => {
      const result = await gateStatusTool(deps.reads, id, { contract: deps.contract, gate: deps.gate });
      return reply(result.text, result.facts);
    },
  );

  return server;
}
