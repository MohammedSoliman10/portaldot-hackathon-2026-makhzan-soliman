import { describe, expect, it } from "vitest";
import {
  EVIDENCE_STAGES,
  ROUND_STATUSES,
  STAGE_LABELS,
  deriveDealState,
  isPassedClaimSafe,
  roundView,
  stageView,
} from "../src/data/status";
import { cloneFixture } from "../src/test/fixtures";

describe("vocabularies", () => {
  it("defines exactly five round labels", () => {
    expect(ROUND_STATUSES).toEqual(["pending", "submitted", "passed", "failed", "unanswered"]);
    expect(ROUND_STATUSES.map((status) => roundViewLabel(status))).toEqual([
      "pending",
      "submitted",
      "passed",
      "failed",
      "unanswered",
    ]);
  });

  it("defines exactly five evidence stages in pipeline order", () => {
    expect(EVIDENCE_STAGES).toEqual(["submitted", "included", "executed", "finalized", "readBack"]);
    expect(EVIDENCE_STAGES.map((stage) => STAGE_LABELS[stage])).toEqual([
      "submitted",
      "included",
      "executed",
      "finalized",
      "read back",
    ]);
  });
});

// Small local helper so the vocabulary assertion reads as a table, not as five separate expectations.
function roundViewLabel(status: (typeof ROUND_STATUSES)[number]): string {
  const fixture = cloneFixture();
  const round = fixture.rounds[0]!;
  round.status = status;
  return roundView(round).label;
}

describe("roundView", () => {
  it("maps the passed fixture round and confirms the read-back", () => {
    const round = cloneFixture().rounds[0]!;
    const view = roundView(round);
    expect(view.label).toBe("passed");
    expect(view.confirmed).toBe(true);
    expect(view.note).toMatch(/read-back/i);
  });

  it("maps the slashed fixture round and shows the slash", () => {
    const view = roundView(cloneFixture().rounds[1]!);
    expect(view.label).toBe("failed");
    expect(view.slashUnits).toBe("2000000000000000");
    expect(view.confirmed).toBe(true);
  });

  it("refuses to show a pass that the read-back does not confirm", () => {
    const round = cloneFixture().rounds[0]!;
    round.readBack.challengeOpenAfter = true;
    const view = roundView(round);
    expect(view.confirmed).toBe(false);
    expect(isPassedClaimSafe(round)).toBe(false);
    expect(view.note).toMatch(/read-back/i);
  });

  it("never lets pending or unanswered become passed", () => {
    for (const status of ["pending", "unanswered"] as const) {
      const round = cloneFixture().rounds[0]!;
      round.status = status;
      expect(isPassedClaimSafe(round)).toBe(false);
      expect(roundView(round).label).not.toBe("passed");
    }
  });

  it("keeps an open submitted round explicitly unresolved", () => {
    const round = cloneFixture().rounds[0]!;
    round.status = "submitted";
    const view = roundView(round);
    expect(view.label).toBe("submitted");
    expect(view.note).toMatch(/not resolved/i);
    expect(view.confirmed).toBe(false);
  });
});

describe("stageView", () => {
  it("marks every observed stage and leaves the rest unobserved", () => {
    const fixture = cloneFixture();
    const deployment = stageView(fixture.transactions[0]!);
    expect(deployment).toHaveLength(5);
    expect(deployment.every((stage) => stage.observed)).toBe(true);

    const registration = stageView(fixture.transactions[1]!);
    expect(registration.every((stage) => stage.observed)).toBe(false);
    expect(registration.map((stage) => stage.display)).toEqual([
      "submitted",
      "included",
      "executed",
      "finalized",
      "read back",
    ]);
  });

  it("does not infer a stage from a later one", () => {
    const stages = stageView({ ...cloneFixture().transactions[0]!, stages: ["submitted", "executed"] });
    expect(stages.map((stage) => stage.observed)).toEqual([true, false, true, false, false]);
  });
});

describe("deal state", () => {
  it("lets the settled flag win, then the head block", () => {
    const deal = cloneFixture().deals[0]!;
    expect(deriveDealState(deal, 3)).toBe("settled");
    deal.flags = 0;
    expect(deriveDealState(deal, 10)).toBe("active");
    expect(deriveDealState(deal, 24)).toBe("expired");
  });
});
