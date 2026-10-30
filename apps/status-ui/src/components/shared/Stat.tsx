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
  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs ${className}`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="font-mono text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {value}
          </div>
          <Chip label={label} />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-600 sm:text-sm">{subtitle}</p>
      </div>
      {detail ? (
        <p className="mt-3 font-mono text-[11px] text-slate-400 border-t border-slate-100 pt-2">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
