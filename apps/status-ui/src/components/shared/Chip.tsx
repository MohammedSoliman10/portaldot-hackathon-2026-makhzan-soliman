import type { ReactNode } from "react";
import type { Label } from "../../data/labels";

export type ChipTone = "brand" | "neutral" | "pass" | "danger" | "warn" | "note";

export interface ChipProps {
  label: Label | string;
  tone?: ChipTone;
  children?: ReactNode;
  className?: string;
}

export function Chip({ label, tone, children, className = "" }: ChipProps) {
  let toneClass = "bg-info-surface text-info border-info";

  if (label === "MEASURED" || tone === "brand") {
    toneClass = "bg-surface-2 text-gold-bright border-line-strong";
  } else if (label === "REPORTED" || tone === "neutral") {
    toneClass = "bg-info-surface text-info border-info";
  } else if (label === "DESIGN NOTE" || tone === "note") {
    toneClass = "bg-note-surface text-note border-note";
  } else if (label === "SIMULATED") {
    toneClass = "bg-surface-2 text-muted border-dashed border-line-strong";
  } else if (label === "PENDING LIVE RUN") {
    toneClass = "bg-warn-surface text-warn border-warn";
  } else if (tone === "pass") {
    toneClass = "bg-ok-surface text-ok border-ok";
  } else if (tone === "danger") {
    toneClass = "bg-danger-surface text-danger border-danger";
  }

  return (
    <span
      className={`label-chip inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[13px] font-medium tracking-wide uppercase whitespace-nowrap ${toneClass} ${className}`}
      data-label={label}
    >
      {label === "MEASURED" ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold inline-block" />
      ) : tone === "pass" ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ok inline-block" />
      ) : tone === "danger" ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger inline-block" />
      ) : null}
      {children ?? label}
    </span>
  );
}
