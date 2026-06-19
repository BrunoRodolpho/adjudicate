import { describe, expect, it } from "vitest";
import { SANDBOX_SCHEMAS, type SandboxIntentSchema } from "./sandbox-schemas";
import { runPlayground } from "@/lib/kernel-runner";

/**
 * Sandbox-mode conformance (plan 132 · T2).
 *
 * `SANDBOX_SCHEMAS` declares the per-intent form fields (with `.default`s) and
 * the named `stateKnobs` (written at `statePath` into `baseState`) that the
 * Configure-&-test surface opens on. None of it was tested. This assembles each
 * intent's opening payload + state EXACTLY as the form would on first render
 * (field defaults + knob defaults applied at their `statePath`), runs it through
 * the real kernel, and asserts:
 *   - the decision is one of the six CLOSED outcomes (000_index §D-2: no 7th
 *     kind), and
 *   - `runPlayground` routes the intent to the expected installed Pack.
 *
 * Per §7 (over-pinning risk) this deliberately does NOT pin a specific kind for
 * sandbox defaults — those seeds may be retuned later — only six-outcome
 * well-formedness + correct Pack routing.
 */

const SIX_OUTCOMES: ReadonlySet<string> = new Set([
  "EXECUTE",
  "REFUSE",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "REWRITE",
]);

/**
 * The content `packId` is a UI-layer SLUG (`payments-pix`); the kernel-runner
 * returns the real installed Pack id (`pack-payments-pix`, or for the inline
 * demo packs `pack-pii-demo` / `pack-token-budget-demo` / `pack-terminal-agent`).
 * This map is the (asserted-exhaustive) bridge between the two namespaces; it is
 * what makes the routing assertion non-vacuous — a schema intent silently
 * rerouting to the wrong Pack fails here.
 */
const SLUG_TO_KERNEL_PACK_ID: Readonly<Record<string, string>> = {
  "payments-pix": "pack-payments-pix",
  "identity-kyc": "pack-identity-kyc",
  "deployments-approval": "pack-deployments-approval",
  "pii-redaction": "pack-pii-demo",
  "token-budget": "pack-token-budget-demo",
  "command-risk": "pack-terminal-agent",
};

/** Assemble the form's opening payload from each field's `.default`. */
function assembleDefaultPayload(
  intent: SandboxIntentSchema,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of intent.payloadFields) {
    if (field.default !== undefined) payload[field.name] = field.default;
  }
  return payload;
}

/** Write `value` at a dot `path` into a deep-cloned `base`, creating objects. */
function writeAtPath(
  base: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = base;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    const next = cursor[key];
    if (next === undefined || next === null || typeof next !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

/** Assemble baseState + stateKnob defaults applied at their `statePath`. */
function assembleBaseState(intent: SandboxIntentSchema): unknown {
  const base: Record<string, unknown> =
    intent.baseState !== undefined
      ? (structuredClone(intent.baseState) as Record<string, unknown>)
      : {};
  for (const knob of intent.stateKnobs ?? []) {
    if (knob.default !== undefined) {
      writeAtPath(base, knob.statePath, knob.default);
    }
  }
  return intent.baseState === undefined &&
    (intent.stateKnobs ?? []).length === 0
    ? undefined
    : base;
}

interface FlatIntent {
  readonly packSlug: string;
  readonly intentKind: string;
  readonly intent: SandboxIntentSchema;
}

const FLAT_INTENTS: ReadonlyArray<FlatIntent> = SANDBOX_SCHEMAS.flatMap((p) =>
  p.intents.map((intent) => ({
    packSlug: p.packId,
    intentKind: intent.intentKind,
    intent,
  })),
);

describe("sandbox-schemas conformance: SANDBOX_SCHEMAS defaults drive the kernel", () => {
  it("the slug→kernel-pack map covers every schema (no orphan slug)", () => {
    // If a new Pack slug is added to SANDBOX_SCHEMAS without a kernel-id mapping,
    // the routing assertion below would throw on `undefined` — surface it here
    // as an explicit, readable failure instead.
    for (const schema of SANDBOX_SCHEMAS) {
      expect(
        SLUG_TO_KERNEL_PACK_ID[schema.packId],
        `missing kernel-pack mapping for slug "${schema.packId}"`,
      ).toBeDefined();
    }
  });

  it("the intent table is non-empty (sanity: not a vacuous pass)", () => {
    expect(FLAT_INTENTS.length).toBeGreaterThanOrEqual(8);
  });

  it.each(FLAT_INTENTS)(
    "[$packSlug] $intentKind defaults → a well-formed six-outcome Decision routed to the right Pack",
    async ({ packSlug, intentKind, intent }) => {
      const payload = assembleDefaultPayload(intent);
      const state = assembleBaseState(intent);
      const res = await runPlayground({ intentKind, payload, state });

      // §D-2: the closed 6-outcome algebra — never a 7th kind.
      expect(SIX_OUTCOMES.has(res.decision.kind)).toBe(true);
      // Every Decision carries its basis list (the closed-algebra shape).
      expect(Array.isArray(res.decision.basis)).toBe(true);
      // The intent routed to the Pack the schema declares (slug→kernel id).
      expect(res.packId).toBe(SLUG_TO_KERNEL_PACK_ID[packSlug]);
    },
  );
});
