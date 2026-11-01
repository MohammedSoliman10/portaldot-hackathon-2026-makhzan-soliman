import type { ReactNode } from "react";
import type { Label } from "../../data/labels";
import { Chip } from "./Chip";

export interface StatProps {
  value: ReactNode;
  subtitle: string;
  label: Label;
  detail?: string;
  className?: string;
}

export function Stat({ value, subtitle, label, detail, className = "" }: StatProps) {
  // If value is a string containing "tPOT" or ending with a unit, render unit smaller on same line
  let formattedValue: ReactNode = value;
  if (typeof value === "string") {
    const match = value.match(/^(.*?)\s+(tPOT)$/);
    if (match) {
      formattedValue = (
        <span className="whitespace-nowrap min-w-0 inline-flex items-baseline gap-1">
          <span>{match[1]}</span>{" "}
          <span className="text-base sm:text-lg font-normal text-gold">{match[2]}</span>
        </span>
      );
    }
  }

  return (
    <div
      className={`flex flex-col justify-between rounded-[20px] border border-line-strong bg-surface p-5 shadow-[var(--glow)] min-w-0 h-full ${className}`}
    >
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-start min-w-0">
          <Chip label={label} />
        </div>
        <div className="font-mono text-2xl font-bold tracking-tight text-gold-bright sm:text-3xl whitespace-nowrap min-w-0">
          {formattedValue}
        </div>
        <p className="mt-2 text-[19px] font-medium text-ink min-w-0 leading-snug">{subtitle}</p>
      </div>
      {detail ? (
        <p className="mt-3 text-[15px] text-muted border-t border-line pt-2 min-w-0">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
