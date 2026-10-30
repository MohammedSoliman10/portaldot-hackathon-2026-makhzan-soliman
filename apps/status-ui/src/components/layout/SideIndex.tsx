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
      <ol className="sticky top-16 space-y-1 font-mono text-xs">
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
                className={`flex items-center gap-2.5 rounded-full px-3.5 py-2 transition-all no-underline ${
                  active
                    ? "bg-slate-900 text-white font-semibold shadow-xs"
                    : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 font-medium"
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
      </ol>
    </nav>
  );
}
