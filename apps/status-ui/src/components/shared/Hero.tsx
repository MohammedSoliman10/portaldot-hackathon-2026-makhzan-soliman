import type { ReactNode } from "react";

export interface HeroProps {
  headline: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Hero({ headline, subtitle, children, className = "" }: HeroProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-3xl bg-[#0c0d10] p-6 text-white shadow-xl sm:p-10 border border-white/10 ${className}`}
      style={{
        backgroundImage:
          "radial-gradient(circle at 85% 15%, rgba(217, 164, 65, 0.15) 0%, transparent 55%), radial-gradient(circle at 10% 90%, rgba(255, 255, 255, 0.03) 0%, transparent 40%)",
      }}
    >
      <div className="relative z-10 max-w-[68ch]">
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl sm:leading-[1.15] text-white">
          {headline}
        </h1>
        {subtitle ? (
          <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed max-w-[56ch]">
            {subtitle}
          </p>
        ) : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}
