import { describe, expect, it } from "vitest";
import { replayFor } from "../src/data/replay";
import type { EvidenceBundle } from "../src/data/schema";
import run2 from "../public/evidence/portaldot-live-run2.json";

const bundle = run2 as unknown as EvidenceBundle;

describe("the recorded run as steps", () => {
  it("replays deal 2 in the order it happened, including the unanswered challenge", () => {
    const replay = replayFor(bundle, 2);
    expect(replay).not.toBeNull();
    expect(replay!.dealId).toBe(2);
    expect(replay!.steps.map((step) => step.kind)).toEqual([
      "create",
      "challenge",
      "answer",
      "challenge",
      "no-answer",
      "resolve",
      "claim",
      "settle",
    ]);
    expect(replay!.steps.map((step) => step.block)).toEqual([
      172578, 172584, 172585, 172602, 172652, 172658, 172881, 172887,
    ]);
  });

  it("names the two rounds and says which one was answered", () => {
    const replay = replayFor(bundle, 2)!;
    const challenge = replay.steps[1]!;
    expect(challenge.title).toMatch(/challenge 1 of 2/i);
    expect(challenge.what).toMatch(/block 29\b/);
    expect(challenge.tx).toBe("0xd2d8445b0671aa3d0c307ce54c1fb251bc6cd08b7d72a3f291ca7497c0d65cdb");

    const answer = replay.steps[2]!;
    expect(answer.title).toMatch(/answered/i);
    expect(answer.what).toMatch(/one block later/i);
    expect(answer.tx).toBe("0xb1ddb1fb54e6f4c4405cfcb85640cae51808ef6ce7509f0e14acc422c3621210");

    const second = replay.steps[3]!;
    expect(second.title).toMatch(/challenge 2 of 2/i);
    expect(second.what).toMatch(/block 623\b/);
    expect(second.what).toMatch(/172,652/);
  });

  it("states the unanswered window and the exact slash", () => {
    const replay = replayFor(bundle, 2)!;
    const missed = replay.steps[4]!;
    expect(missed.kind).toBe("no-answer");
    expect(missed.tx).toBeNull();
    expect(missed.what).toMatch(/no answer arrived/i);
    expect(missed.what).toMatch(/172,652/);

    const resolve = replay.steps[5]!;
    expect(resolve.tx).toBe("0x97da004710a5e01ea97b9d602f5b8ef5c5382ea5800c5d52b02951cb6809e8a3");
    expect(resolve.what).toMatch(/30 tPOT to 24 tPOT/);
    expect(resolve.what).toMatch(/6 tPOT/);
    expect(resolve.what).toMatch(/600,000,000,000,000 units/);
    expect(resolve.what).toMatch(/6,000,000,000,000,000,000 wei/);
  });

  it("replays deal 1 without inventing a slash", () => {
    const replay = replayFor(bundle, 1)!;
    expect(replay.steps.map((step) => step.kind)).toEqual([
      "create",
      "challenge",
      "answer",
      "claim",
      "settle",
    ]);
    expect(replay.steps.some((step) => step.kind === "resolve")).toBe(false);
    expect(replay.steps.some((step) => step.kind === "no-answer")).toBe(false);
    const answer = replay.steps[2]!;
    expect(answer.what).toMatch(/bond did not move/i);
  });

  it("returns null for a deal the evidence does not hold", () => {
    expect(replayFor(bundle, 9)).toBeNull();
    expect(replayFor(null, 2)).toBeNull();
  });

  it("gives every step a block, a plain-words line and the evidence file", () => {
    for (const dealId of [1, 2]) {
      for (const step of replayFor(bundle, dealId)!.steps) {
        expect(step.block).toBeTypeOf("number");
        expect(step.what.length).toBeGreaterThan(20);
        expect(step.source).toBe("evidence/portaldot-live-run2.json");
        expect(step.label).toBe("REPORTED");
      }
    }
  });
});
