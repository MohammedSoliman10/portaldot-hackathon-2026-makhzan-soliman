import type { ModeState } from "../../config/modes";
import type { EvidenceState } from "../../data/schema";
import { LabelLegend } from "../LabelLegend";

const BUILD_ID = __BUILD_ID__;

export function Footer({ mode, evidence }: { mode: ModeState; evidence: EvidenceState }) {
  return (
    <footer data-testid="footer" className="rule mt-12 px-4 py-8 text-xs sm:px-6">
      <div className="mx-auto grid max-w-[var(--measure)] grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <p className="mb-2 font-mono break-words text-paper-dim">
            evidence {evidence.bundle?.id ?? "none"} · {evidence.bundle?.schema ?? "no schema"} ·{" "}
            {evidence.verified ? "hash verified" : "unverified"} · build {BUILD_ID}
          </p>
          <p className="text-ash">
            read-only: this page cannot sign, send or spend. Mode {mode.mode}, chain{" "}
            {mode.expectedChainId}. Every number carries a label and a source.
          </p>
          <p className="mt-2 text-ash-2">
            Source: {evidence.bundle?.source ?? "no evidence source recorded"}.
          </p>
        </div>
        <div className="min-w-0 md:w-72">
          <LabelLegend />
        </div>
      </div>
    </footer>
  );
}
