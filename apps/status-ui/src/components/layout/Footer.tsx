import type { ModeState } from "../../config/modes";
import type { EvidenceState } from "../../data/schema";
import { LabelLegend } from "../LabelLegend";

const BUILD_ID = __BUILD_ID__;

export function Footer({ mode, evidence }: { mode: ModeState; evidence: EvidenceState }) {
  return (
    <footer data-testid="footer" className="mt-16 border-t border-line bg-bg px-4 py-10 text-[15px] sm:px-6">
      <div className="mx-auto grid max-w-[var(--measure)] grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-1.5">
          <p className="break-words text-ink font-medium text-[15px]">
            evidence {evidence.bundle?.id ?? "none"} · {evidence.bundle?.schema ?? "no schema"} ·{" "}
            {evidence.verified ? "hash verified" : "unverified"} · build {BUILD_ID}
          </p>
          <p className="text-muted">
            read-only: this page cannot sign, send or spend. Mode {mode.mode}, chain{" "}
            {mode.expectedChainId}. Every number carries a label and a source.
          </p>
          <p className="break-words text-muted">
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
