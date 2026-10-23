import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <section className="py-10">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-xl">Not found</h1>
      <p className="mt-3 text-paper-dim">No route matches this path. Nothing was read from a chain.</p>
      <p className="mt-4 flex gap-4 text-sm">
        <Link to="/" className="link-quiet underline">
          Overview
        </Link>
        <Link to="/verify" className="link-quiet underline">
          Verify a file
        </Link>
      </p>
    </section>
  );
}
