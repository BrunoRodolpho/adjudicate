import type { DecisionBasis } from "@adjudicate/core";

const categoryStyle: Record<string, string> = {
  state: "border-sky-500/30 text-sky-300/80",
  auth: "border-yellow-500/30 text-yellow-300/80",
  taint: "border-violet-500/30 text-violet-300/80",
  ledger: "border-emerald-500/30 text-emerald-300/80",
  schema: "border-zinc-500/30 text-zinc-300/80",
  business: "border-orange-500/30 text-orange-300/80",
  validation: "border-fuchsia-500/30 text-fuchsia-300/80",
  kill: "border-red-500/30 text-red-300/80",
  deadline: "border-amber-500/30 text-amber-300/80",
};

export function BasisFlatSet({
  basis,
}: {
  basis: readonly DecisionBasis[];
}) {
  if (basis.length === 0) {
    return <p className="italic text-[11px] text-faint">no basis emitted</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {basis.map((b, i) => (
        <li
          key={`${b.category}:${b.code}:${i}`}
          className={`flex items-center gap-1 rounded-sm border bg-canvas px-1.5 py-0.5 text-[10px] ${
            categoryStyle[b.category] ?? "border-edge text-muted"
          }`}
          title={b.detail ? JSON.stringify(b.detail) : undefined}
        >
          <span className="text-faint">{b.category}</span>
          <span className="text-muted">:</span>
          <code className="text-ink/90">{b.code}</code>
        </li>
      ))}
    </ul>
  );
}
