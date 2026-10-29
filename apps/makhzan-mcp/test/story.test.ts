import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DealVerifyInput } from "../../makhzan/src/dealVerify.ts";
import { storyTool } from "../src/tools/story.ts";
import { storyInput } from "./helpers.ts";
import type { StorySource } from "../src/tools/story.ts";

const source = (input: DealVerifyInput | (() => Promise<DealVerifyInput>)): StorySource => ({
  input: typeof input === "function" ? input : async () => input,
});

test("deal_story rebuilds the history from events and reports the verify result", async () => {
  const result = await storyTool(source(storyInput()), 2, {
    contract: "0x60481DFcFCA34A8F095939D9675eC715127B2e44",
  });

  assert.match(result.text, /^\[MEASURED\] makhzan_deal_story — deal 2/);
  assert.match(result.text, /PASS deal 2 opened with root/);
  assert.match(result.text, /challenge #1 issued at block 110 index 1 deadline 160/);
  assert.match(result.text, /challenge #1 answered at block 120/);
  assert.match(result.text, /RESULT: PASS/);
  assert.match(result.text, /history \(3 events/);
  assert.match(result.text, /block 100\s+created/);
  assert.match(result.text, /block 110\s+opened\s+index 1, deadline 160/);
  assert.equal(result.facts.label, "MEASURED");
  assert.equal(result.facts.result, "PASS");
  assert.equal(result.facts.head, 150);
  assert.equal((result.facts.history as unknown[]).length, 3);
});

test("deal_story is INCOMPLETE, never PASS, when the node refuses the log range", async () => {
  const input = storyInput();
  input.logs = null;
  input.logsError = "eth_getLogs 100..150: block range too large";
  const result = await storyTool(source(input), 2, { contract: "0x60481DFcFCA34A8F095939D9675eC715127B2e44" });

  assert.equal(result.facts.result, "INCOMPLETE");
  assert.match(result.text, /UNKNOWN challenge history unavailable/);
  assert.doesNotMatch(result.text, /RESULT: PASS/);
});

test("deal_story surfaces a failed fetch instead of inventing a history", async () => {
  await assert.rejects(
    storyTool(source(async () => {
      throw new Error("deal 9 does not exist");
    }), 9, { contract: "0x60481DFcFCA34A8F095939D9675eC715127B2e44" }),
    /does not exist/,
  );
});
