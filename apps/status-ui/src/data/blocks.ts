/**
 * Where a block number should point.
 *
 * There is no EVM explorer on this network, so a transaction hash has no page to open. A *block* does:
 * the Portaldot node console reads the test node over its websocket endpoint and can show a block by
 * number. That link was checked in a headless browser against the live node — block 172,658 opened
 * with its hash and its `revive.ethTransact` extrinsic, no console errors — before it was shipped.
 * The encoded `rpc` value is the exact one the check used, so the console reads it as one parameter.
 */
export const NODE_CONSOLE_URL = "https://node-console.portaldot.dev";

/** `wss://test-node-v3.portaldot.dev`, percent-encoded. */
const NODE_CONSOLE_RPC = "wss%3A%2F%2Ftest-node-v3.portaldot.dev";

/** The console page for one block. Throws on anything that cannot be a block number. */
export function blockHref(block: number): string {
  if (!Number.isInteger(block) || block < 0) {
    throw new RangeError(`a block number must be a whole number of zero or more, got ${block}`);
  }
  return `${NODE_CONSOLE_URL}/?rpc=${NODE_CONSOLE_RPC}#/explorer/query/${block}`;
}
