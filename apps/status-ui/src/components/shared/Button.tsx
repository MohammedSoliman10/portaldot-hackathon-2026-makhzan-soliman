import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

export type ButtonVariant = "primary" | "secondary" | "dark" | "ghost";

interface CommonProps {
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined };
export type LinkButtonProps = CommonProps & LinkProps & { to: string };

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-ochre text-ink hover:bg-[#e5b350] active:bg-[#c99432] shadow-sm font-semibold",
  secondary: "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 font-medium shadow-xs",
  dark: "bg-ink text-white hover:bg-slate-800 active:bg-slate-900 font-medium shadow-sm",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 font-medium",
};

export function Button({
  variant = "primary",
  children,
  className = "",
  to,
  ...props
}: ButtonProps | LinkButtonProps) {
  const baseClasses = `inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm tracking-tight transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre disabled:opacity-50 disabled:pointer-events-none no-underline ${VARIANT_CLASSES[variant]} ${className}`;

  if (to !== undefined) {
    return (
      <Link to={to} className={baseClasses} {...(props as Omit<LinkProps, "to">)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={baseClasses} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
