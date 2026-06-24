"use client";

import { ChevronDown } from "lucide-react";
import { SANDBOX_SCHEMAS } from "@/content/sandbox-schemas";
import type {
  SandboxIntentSchema,
  SandboxPackSchema,
} from "@/content/sandbox-schemas";
import { cn } from "@/lib/cn";

/**
 * SandboxPackPicker — the two-step "what do you want to test" control.
 *
 * Step 1 is a compact segmented list of the six installed Packs (one row, no
 * cross-domain chip wall). Step 2 is a plain <select> of that Pack's intents,
 * so the surface only ever shows intents the chosen Pack actually routes.
 *
 * Controlled: the parent owns `packId` / `intentKind` and supplies setters.
 * Picking a Pack hands the parent both the Pack and its first intent so it can
 * re-seed the form defaults in one place.
 */
export function SandboxPackPicker({
  packId,
  intentKind,
  onPickPack,
  onPickIntent,
}: {
  readonly packId: string;
  readonly intentKind: string;
  /** Fires with the new Pack and its first intent (parent re-seeds the form). */
  readonly onPickPack: (
    pack: SandboxPackSchema,
    firstIntent: SandboxIntentSchema,
  ) => void;
  /** Fires with the chosen intent within the current Pack. */
  readonly onPickIntent: (intent: SandboxIntentSchema) => void;
}) {
  const activePack =
    SANDBOX_SCHEMAS.find((p) => p.packId === packId) ?? SANDBOX_SCHEMAS[0]!;
  const activeIntent =
    activePack.intents.find((i) => i.intentKind === intentKind) ??
    activePack.intents[0]!;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-console-muted">
        Choose an installed Pack (e.g. Payments, Deployments) and the intent
        kind you want to put through the kernel.
      </p>

      {/* ── Step 1 · Pack ─────────────────────────────────────────────── */}
      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-[10px] uppercase tracking-section text-console-muted">
          1 · Pick a pack
        </legend>
        <div
          role="radiogroup"
          aria-label="Pack"
          className="flex flex-wrap gap-2"
        >
          {SANDBOX_SCHEMAS.map((pack) => {
            const selected = pack.packId === packId;
            return (
              <button
                key={pack.packId}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPickPack(pack, pack.intents[0]!)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-console-ink/40",
                  selected
                    ? "border-transparent bg-gradient-primary text-white shadow-sm"
                    : "border-console-edge bg-console-panel text-console-muted hover:border-console-ink/30 hover:text-console-ink",
                )}
              >
                {pack.displayName}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── Step 2 · Intent (scoped to the chosen Pack) ───────────────── */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="sandbox-intent"
          className="font-mono text-[10px] uppercase tracking-section text-console-muted"
        >
          2 · Pick an intent
        </label>
        <div className="relative max-w-md">
          <select
            id="sandbox-intent"
            value={intentKind}
            onChange={(e) => {
              const next = activePack.intents.find(
                (i) => i.intentKind === e.target.value,
              );
              if (next) onPickIntent(next);
            }}
            className={cn(
              "w-full appearance-none rounded-lg border border-console-edge bg-console-panel py-2 pl-3 pr-9 text-sm text-console-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-console-ink/40",
            )}
          >
            {activePack.intents.map((intent) => (
              <option key={intent.intentKind} value={intent.intentKind}>
                {intent.label} — {intent.intentKind}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-console-faint"
          />
        </div>
        <p className="text-[12px] leading-snug text-console-muted">
          <code className="font-mono text-console-ink/80">
            {activeIntent.intentKind}
          </code>{" "}
          — {activeIntent.label.toLowerCase()}.
        </p>
      </div>
    </div>
  );
}
