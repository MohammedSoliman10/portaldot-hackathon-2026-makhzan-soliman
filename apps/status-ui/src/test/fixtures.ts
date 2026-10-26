import fixtureJson from "../../public/evidence/local-anvil-2026-10-23.json";
import type { EvidenceBundle, EvidenceState } from "../data/schema";

export const fixture = fixtureJson as unknown as EvidenceBundle;

/** A deep copy so a test can mutate one field without touching another test's fixture. */
export function cloneFixture(): EvidenceBundle {
  return structuredClone(fixture);
}

export function evidenceState(bundle: EvidenceBundle | null = cloneFixture()): EvidenceState {
  return {
    bundle,
    verified: bundle !== null,
    error: bundle === null ? "no evidence bundle" : null,
    loading: false,
  };
}
