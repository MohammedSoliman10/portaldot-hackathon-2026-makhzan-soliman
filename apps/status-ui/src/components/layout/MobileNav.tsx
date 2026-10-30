import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

export const MOBILE_ROUTES = [
  { to: "/", label: "Overview" },
  { to: "/deal/1", label: "Deal" },
  { to: "/verify", label: "Verify" },
  { to: "/proof", label: "Proof" },
  { to: "/gate", label: "Gate" },
  { to: "/judges", label: "Judges" },
  { to: "/replay", label: "Replay" },
  { to: "/receipt/1", label: "Receipt 1" },
  { to: "/receipt/2", label: "Receipt 2" },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const { pathname } = useLocation();

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Close when pathname changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="mobile-navigation-menu"
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 py-2 font-mono text-xs uppercase tracking-wider text-slate-800 shadow-xs hover:border-ochre hover:text-ochre focus-visible:outline-2 focus-visible:outline-ochre"
      >
        <span className="sr-only">{isOpen ? "Close" : "Open"}</span>
        <span className="flex items-center gap-1.5">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            )}
          </svg>
          <span className="font-medium">Menu</span>
        </span>
      </button>

      {isOpen ? (
        <nav
          id="mobile-navigation-menu"
          aria-label="Mobile navigation"
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xl text-slate-800"
        >
          <ul className="space-y-1">
            {MOBILE_ROUTES.map((route, index) => {
              const active =
                route.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(route.to.split("/").slice(0, 2).join("/"));
              return (
                <li key={route.to}>
                  <Link
                    to={route.to}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setIsOpen(false)}
                    className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2 font-mono text-xs no-underline transition-colors ${
                      active
                        ? "bg-slate-900 text-white font-semibold shadow-xs"
                        : "text-slate-700 hover:bg-slate-100 font-medium"
                    }`}
                  >
                    <span className={active ? "text-amber-400 font-bold" : "text-slate-400"}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{route.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
