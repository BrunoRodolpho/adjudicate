"use client";

import { useConfigSealStatus } from "@/hooks/useConfigSealStatus";
import { cn } from "@/lib/cn";

/**
 * Config Integrity Seal status (ADR-121). Shows whether the installed Pack's
 * introspectable config surface still matches its signed seal. A mismatch means
 * the Pack drifted from what was sealed — a security-relevant integrity failure.
 */
export function ConfigSealStatus() {
  const { data, isLoading, isError } = useConfigSealStatus();

  return (
    <section className="rounded-sm border border-edge bg-panel/40" data-testid="config-seal-status">
      <header className="flex items-baseline justify-between border-b border-edge px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-section text-faint">
          Configuration Integrity Seal
        </span>
        <span className="text-[10px] text-faint">ADR-121</span>
      </header>
      <div className="px-3 py-2 text-[11px]">
        {isLoading ? (
          <p className="text-muted">Loading seal status…</p>
        ) : isError || !data ? (
          <p className="italic text-faint">
            No config seal configured. Compute verifyConfigSeal(pack, seal) at
            startup and wire it into the route handler context.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <p
              className={cn(
                "font-medium",
                data.verified ? "text-emerald-300" : "text-red-300",
              )}
            >
              {data.verified ? "✓ Sealed — config matches" : "✗ Config drift detected"}
            </p>
            <p className="text-muted">
              digest {data.digestMatch}:{" "}
              <span className="font-mono">{data.computedDigest.slice(0, 16)}…</span>
            </p>
            {!data.verified && data.errors.length > 0 ? (
              <ul className="mt-1 list-disc pl-4 text-red-300">
                {data.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
