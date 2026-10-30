import type { ModeState } from "../../config/modes";
import type { EvidenceState } from "../../data/schema";
import { LabelLegend } from "../LabelLegend";

const BUILD_ID = __BUILD_ID__;

export function Footer({ mode, evidence }: { mode: ModeState; evidence: EvidenceState }) {
  return (
    <footer data-testid="footer" className="mt-16 border-t border-slate-200/90 bg-white/60 px-4 py-10 text-xs sm:px-6">
      <div className="mx-auto grid max-w-[var(--measure)] grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-1.5">
          <p className="font-mono break-words text-slate-700 font-medium">
            evidence {evidence.bundle?.id ?? "none"} · {evidence.bundle?.schema ?? "no schema"} ·{" "}
            {evidence.verified ? "hash verified" : "unverified"} · build {BUILD_ID}
          </p>
          <p className="text-slate-500">
            read-only: this page cannot sign, send or spend. Mode {mode.mode}, chain{" "}
            {mode.expectedChainId}. Every number carries a label and a source.
          </p>
          <p className="break-words text-slate-400">
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
