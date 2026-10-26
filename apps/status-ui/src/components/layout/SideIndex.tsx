import { Link, useLocation } from "react-router-dom";

const ROUTES = [
  { to: "/", label: "Overview" },
  { to: "/deal/1", label: "Deal" },
  { to: "/verify", label: "Verify" },
  { to: "/proof", label: "Proof" },
  { to: "/judges", label: "Judges" },
  { to: "/replay", label: "Replay" },
];

export function SideIndex() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Sections" className="hidden md:block">
      <ol className="sticky top-16 space-y-2 font-mono text-xs">
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
                className={`link-quiet flex gap-2 ${active ? "text-ochre" : ""}`}
              >
                <span className="text-ash-2">{String(index + 1).padStart(2, "0")}</span>
                <span>{route.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
