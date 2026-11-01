import { Link, useLocation } from "react-router-dom";

const ROUTES = [
  { to: "/", label: "Overview" },
  { to: "/deal/1", label: "Deal" },
  { to: "/verify", label: "Verify" },
  { to: "/proof", label: "Proof" },
  { to: "/gate", label: "Gate" },
  { to: "/judges", label: "Judges" },
  { to: "/replay", label: "Replay" },
];

export function SideIndex() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Sections" className="hidden md:block">
      <ol className="sticky top-16 space-y-1.5 text-[16px]">
        {ROUTES.map((route, index) => {
          const active =
            route.to === "/"
              ? pathname === "/"
              : pathname.startsWith(route.to.split("/").slice(0, 2).join("/"));
          return (
            <li key={route.to}>
              <Link
                to={route.to}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-full px-4 py-2.5 transition-all no-underline ${
                  active
                    ? "bg-gold text-on-gold font-semibold"
                    : "text-muted hover:bg-surface-2 hover:text-ink font-medium"
                }`}
              >
                <span className={`font-mono text-[14px] ${active ? "text-on-gold font-bold" : "text-muted font-semibold"}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{route.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
