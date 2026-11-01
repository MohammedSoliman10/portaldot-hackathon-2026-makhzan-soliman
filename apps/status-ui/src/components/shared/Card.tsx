import type { ElementType, HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: ElementType;
  children: ReactNode;
  className?: string;
}

export function Card({ as: Component = "div", children, className = "", ...props }: CardProps) {
  return (
    <Component
      className={`rounded-[20px] border border-slate-300 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(16,24,40,0.06),0_1px_3px_rgba(16,24,40,0.04)] transition-all ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
