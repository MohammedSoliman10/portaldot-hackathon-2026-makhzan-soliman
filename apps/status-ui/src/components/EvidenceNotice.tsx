import type { EvidenceState } from "../data/schema";

/**
 * Missing, unreadable or unverified evidence becomes a notice, never a blank page. The route keeps
 * rendering whatever it can; this component states what is missing and why.
 */
export function EvidenceNotice({ evidence }: { evidence: EvidenceState }) {
  if (evidence.loading) {
    return (
      <p role="note" className="rule py-3 font-mono text-xs text-ash">
        loading evidence…
      </p>
    );
  }

  if (evidence.bundle === null) {
    return (
      <div role="note" className="my-4 border-l-2 border-ochre-dim py-2 pl-3 text-sm">
        <span className="label-chip mr-2" data-label="REPORTED">
          EVIDENCE
        </span>
        {evidence.error ?? "no evidence bundle was published with this build"}
      </div>
    );
  }

  if (!evidence.verified) {
    return (
      <div role="note" className="my-4 border-l-2 border-ochre-dim py-2 pl-3 text-sm">
        <span className="label-chip mr-2" data-label="REPORTED">
          UNVERIFIED
        </span>
        {evidence.error ?? "unverified evidence: the manifest hash does not match this file"}
      </div>
    );
  }

  return null;
}
