import { describe, expect, it } from "vitest";
import { blockHref, NODE_CONSOLE_URL } from "../src/data/blocks";

const RPC = "wss%3A%2F%2Ftest-node-v3.portaldot.dev";

describe("the node console link", () => {
  it("opens the block that was checked against the live node", () => {
    expect(blockHref(172658)).toBe(
      `https://node-console.portaldot.dev/?rpc=${RPC}#/explorer/query/172658`,
    );
    expect(blockHref(172658)).toBe(
      "https://node-console.portaldot.dev/?rpc=wss%3A%2F%2Ftest-node-v3.portaldot.dev#/explorer/query/172658",
    );
  });

  it("keeps the websocket endpoint encoded, so the console reads it as one parameter", () => {
    const url = new URL(blockHref(1));
    expect(url.searchParams.get("rpc")).toBe("wss://test-node-v3.portaldot.dev");
    expect(url.hash).toBe("#/explorer/query/1");
  });

  it("uses the plain block number, never a thousands separator", () => {
    expect(blockHref(172578)).toContain("/172578");
    expect(blockHref(172578)).not.toContain("172,578");
  });

  it("refuses a number that cannot be a block", () => {
    expect(() => blockHref(-1)).toThrow(/block/i);
    expect(() => blockHref(1.5)).toThrow(/block/i);
    expect(() => blockHref(Number.NaN)).toThrow(/block/i);
  });

  it("is built on the same console the live check used", () => {
    expect(NODE_CONSOLE_URL).toBe("https://node-console.portaldot.dev");
  });
});
