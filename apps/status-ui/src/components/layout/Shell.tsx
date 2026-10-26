import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ModeState } from "../../config/modes";
import type { EvidenceState } from "../../data/schema";
import { EvidenceNotice } from "../EvidenceNotice";
import { ModeBanner } from "../ModeBanner";
import { ErrorBoundary } from "../../app/ErrorBoundary";
import { Footer } from "./Footer";
import { SideIndex } from "./SideIndex";

function Wordmark() {
  return (
    <Link to="/" className="group inline-flex items-baseline gap-2 no-underline" aria-label="Makhzan, home">
      <span className="text-sm font-semibold tracking-[0.28em] text-paper group-hover:text-ochre">MAKHZAN</span>
      <span className="text-xs text-ash">مخزن</span>
    </Link>
  );
}

/** The persistent shell: skip link, mode banner, numbered index, one main landmark, honest footer. */
export function Shell({
  mode,
  evidence,
  children,
}: {
  mode: ModeState;
  evidence: EvidenceState;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink text-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ochre focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <ModeBanner mode={mode} evidence={evidence} />
      <div className="mx-auto grid max-w-[var(--measure)] gap-8 px-4 py-6 sm:px-6 md:grid-cols-[var(--rail)_1fr]">
        <div>
          <div className="mb-6 hidden md:block">
            <Wordmark />
          </div>
          <SideIndex />
        </div>
        <main id="main" tabIndex={-1} className="min-w-0 outline-none">
          <div className="mb-4 md:hidden">
            <Wordmark />
          </div>
          <EvidenceNotice evidence={evidence} />
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
      <Footer mode={mode} evidence={evidence} />
    </div>
  );
}
