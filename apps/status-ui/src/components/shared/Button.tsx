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
  primary: "bg-gold text-on-gold hover:bg-gold-bright active:bg-gold font-semibold",
  secondary: "bg-transparent text-gold border border-line-strong hover:border-gold-bright hover:text-gold-bright font-medium",
  dark: "bg-surface-2 text-ink border border-line-strong hover:border-gold-bright hover:text-gold-bright font-medium",
  ghost: "bg-transparent text-muted hover:bg-surface-2 hover:text-gold-bright font-medium",
};

export function Button({
  variant = "primary",
  children,
  className = "",
  to,
  ...props
}: ButtonProps | LinkButtonProps) {
  const baseClasses = `inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm tracking-tight transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright disabled:opacity-50 disabled:pointer-events-none no-underline ${VARIANT_CLASSES[variant]} ${className}`;

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
