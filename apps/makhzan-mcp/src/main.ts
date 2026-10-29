/**
 * Stdio entry point. Nothing here can write: the config refuses a key, the client is public, and the
 * only side effect is a line on stderr that says what was configured.
 *
 * stdout belongs to the protocol, so every human-readable line goes to stderr. The server never
 * prints a key, a file's contents or an RPC credential; it prints the chain, the contract and the
 * gate address, all of which are public.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.ts";
import { isMissingDeal, makeReadClient, viemReads } from "./reads.ts";
import { SERVER_VERSION, createServer } from "./server.ts";
import type { StorySource } from "./tools/story.ts";
import { fetchDealVerifyInput } from "../../makhzan/src/dealVerifyCli.ts";
import { withRetry } from "./retry.ts";

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`makhzan-mcp: ${error.message}\n`);
      process.exit(2);
    }
    throw error;
  }

  const client = makeReadClient(config);
  const reads = viemReads(client, { gate: config.gate, timeoutMs: config.timeoutMs });
  const story: StorySource = {
    input: (dealId) =>
      withRetry("deal story", () => fetchDealVerifyInput(client, config.contract, dealId, config.blockSize), {
        // The transport caps each eth_getLogs at timeoutMs and the CLI's reader splits a range the
        // node refuses, so the whole history is not put under a single wall-clock limit: an honest
        // 68,000-block range takes longer than 8 s on this node and would fail for being correct.
        retryable: (error) => !isMissingDeal(error),
      }),
  };

  const server = createServer({
    reads,
    story,
    contract: config.contract,
    gate: config.gate,
    blockSize: config.blockSize,
    verifyDir: config.verifyDir,
  });

  process.stderr.write(
    `makhzan-mcp ${SERVER_VERSION}: read-only, chain ${config.chainId}, Makhzan ${config.contract}, ` +
      `gate ${config.gate ?? "not configured"}, ${config.blockSize} B blocks, ${config.timeoutMs} ms per attempt, ` +
      `files under ${config.verifyDir}\n`,
  );
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  process.stderr.write(`makhzan-mcp: ${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});
