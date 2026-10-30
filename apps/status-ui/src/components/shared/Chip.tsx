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
  let toneClass = "bg-slate-100 text-slate-700 border-slate-200";

  if (label === "MEASURED" || tone === "brand") {
    toneClass = "bg-[#fef7ea] text-slate-900 border-[#f3d289]";
  } else if (label === "REPORTED" || tone === "neutral") {
    toneClass = "bg-slate-100 text-slate-700 border-slate-200";
  } else if (label === "DESIGN NOTE" || tone === "note") {
    toneClass = "bg-blue-50 text-blue-800 border-blue-200";
  } else if (label === "SIMULATED") {
    toneClass = "bg-slate-50 text-slate-600 border-dashed border-slate-300";
  } else if (label === "PENDING LIVE RUN") {
    toneClass = "bg-amber-50 text-amber-800 border-amber-200";
  } else if (tone === "pass") {
    toneClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
  } else if (tone === "danger") {
    toneClass = "bg-red-50 text-red-800 border-red-200";
  }

  return (
    <span
      className={`label-chip inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wide uppercase whitespace-nowrap ${toneClass} ${className}`}
      data-label={label}
    >
      {label === "MEASURED" ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ochre inline-block" />
      ) : tone === "pass" ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-600 inline-block" />
      ) : tone === "danger" ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-600 inline-block" />
      ) : null}
      {children ?? label}
    </span>
  );
}
