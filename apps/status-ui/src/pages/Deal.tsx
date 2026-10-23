import { useParams } from "react-router-dom";

export function Deal() {
  const { id } = useParams();
  return (
    <section>
      <p className="eyebrow">02 / deal</p>
      <h1 className="mt-2 text-xl">Deal {id ?? "unknown"}</h1>
    </section>
  );
}
