import type { Refusal } from "@adjudicate/core";

const refusalKindStyle: Record<Refusal["kind"], string> = {
  SECURITY: "border-red-500/40 bg-red-500/5 text-red-300",
  BUSINESS_RULE: "border-orange-500/40 bg-orange-500/5 text-orange-300",
  AUTH: "border-yellow-500/40 bg-yellow-500/5 text-yellow-300",
  STATE: "border-sky-500/40 bg-sky-500/5 text-sky-300",
};

export function RefusalCard({ refusal }: { refusal: Refusal }) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-sm border px-2 py-1.5 ${refusalKindStyle[refusal.kind]}`}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
        <span>{refusal.kind}</span>
        <span className="text-faint">/</span>
        <code className="text-[11px] normal-case tracking-normal">
          {refusal.code}
        </code>
      </div>
      <p className="text-[12px] text-ink/90">{refusal.userFacing}</p>
      {refusal.detail && (
        <p className="text-[10px] text-muted/80">
          <span className="text-faint">detail </span>
          {refusal.detail}
        </p>
      )}
    </div>
  );
}
