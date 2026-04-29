import type { AuditRecord } from "@adjudicate/core";

/**
 * Phase 1 limitation — the framework does not yet expose a Pack registry, so
 * the console infers Pack identity from intent-kind prefix (the convention
 * used by pack-payments-pix). The repo audit's S1 finding (installed-Packs
 * registry) is the prerequisite for replacing this heuristic with a real
 * lookup against the kernel.
 */
function inferPackForIntentKind(
  kind: string,
): { id: string; version: string } | null {
  if (kind.startsWith("pix.charge.")) {
    return { id: "pack-payments-pix", version: "0.1.0-experimental" };
  }
  return null;
}

export function PolicyResolutionList({ record }: { record: AuditRecord }) {
  const pack = inferPackForIntentKind(record.envelope.kind);
  return (
    <div className="flex flex-col gap-2 text-[11px]">
      {pack ? (
        <div className="flex items-center justify-between rounded-sm border border-edge bg-canvas px-2 py-1.5">
          <span className="text-ink">{pack.id}</span>
          <span className="text-faint">@{pack.version}</span>
        </div>
      ) : (
        <p className="italic text-faint">
          No Pack matched intent kind <code>{record.envelope.kind}</code>.
        </p>
      )}
      <p className="text-[10px] text-faint">
        Pack registry not yet exposed by kernel — inference is intent-kind-prefix-based. See repo audit S1.
      </p>
    </div>
  );
}
