import type { ElementType, HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: ElementType;
  children: ReactNode;
  className?: string;
}

export function Card({ as: Component = "div", children, className = "", ...props }: CardProps) {
  return (
    <Component
      className={`rounded-[20px] border border-line-strong bg-surface p-6 shadow-[var(--glow)] transition-all ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
