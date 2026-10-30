import type { ModeState } from "../config/modes";
import type { EvidenceState } from "../data/schema";

type Tone = "recorded" | "live" | "blocking" | "warn";

const truncateTime = (iso: string | undefined): string =>
  iso ? iso.replace(/:\d{2}Z$/, "Z") : "time not recorded";

const hostOf = (rpcUrl: string | null): string => {
  if (!rpcUrl) return "no RPC configured";
  try {
    return new URL(rpcUrl).host;
  } catch {
    return rpcUrl;
  }
};

const environmentLabel = (environment: string | undefined): string => {
  if (environment === "anvil-local") return "local anvil";
  if (environment === "portaldot-testnet") return "Portaldot testnet";
  return "no evidence bundle";
};

const TONE_CLASS: Record<Tone, string> = {
  recorded: "border-b border-slate-200/80 bg-white text-slate-800 shadow-xs",
  live: "border-b border-amber-300 bg-amber-400 text-slate-950 font-medium shadow-xs",
  blocking: "border-b-2 border-red-600 bg-red-50 text-red-900 font-medium",
  warn: "border-b border-amber-300 bg-amber-50 text-amber-950",
};

/**
 * The mode banner is the page's first honest sentence: which mode is active, what it reads, and
 * whether anything is blocked. It is never dismissible and never hides the evidence.
 */
export function ModeBanner({ mode, evidence }: { mode: ModeState; evidence: EvidenceState }) {
  const blocking = mode.blocking;
  let text: string;
  let tone: Tone = mode.mode === "RECORDED" ? "recorded" : "live";

  if (blocking?.kind === "chain-mismatch") {
    text = blocking.detail;
    tone = "blocking";
  } else if (blocking?.kind === "evidence-mismatch") {
    text = blocking.detail;
    tone = "warn";
  } else if (blocking?.kind === "config") {
    text = `CONFIG — ${blocking.detail}`;
    tone = "blocking";
  } else if (blocking?.kind === "no-code") {
    text = "CONFIG — the configured address has no code (eth_getCode returned 0x). Showing recorded evidence.";
    tone = "blocking";
  } else if (mode.mode === "RECORDED") {
    text = `RECORDED — ${environmentLabel(evidence.bundle?.environment)} evidence, ${truncateTime(
      evidence.bundle?.generatedAt,
    )}. No RPC is being read.`;
  } else if (mode.mode === "LOCAL") {
    text = `LOCAL — ${hostOf(mode.rpcUrl)}, chain ${mode.expectedChainId}. Reads only.`;
  } else {
    text = `LIVE — chain ${mode.expectedChainId} via ${hostOf(mode.rpcUrl)}. Reads only.`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Active mode"
      data-mode={mode.mode}
      data-blocking={blocking?.kind ?? "none"}
      className={`sticky top-0 z-20 px-4 py-2 font-mono text-xs tracking-wide sm:px-6 ${TONE_CLASS[tone]}`}
    >
      <span
        className="mr-3 inline-block h-2 w-2 align-middle"
        style={{ background: tone === "blocking" ? "var(--red)" : "var(--ochre)" }}
        aria-hidden="true"
      />
      {text}
    </div>
  );
}
