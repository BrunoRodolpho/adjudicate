import {
  basis,
  decisionExecute,
  type Guard,
  type PolicyBundle,
  type TaintPolicy,
} from "@adjudicate/core";
import {
  filterReadOnly,
  safePlan,
  type CapabilityPlanner,
  type ToolClassification,
} from "@adjudicate/core/llm";

/**
 * {{className}} domain — types, guards, planner, taint policy.
 *
 * The generated Pack handles two demo intents (.create and .confirm).
 * Replace them with your real domain. The kernel evaluates guards in
 * order: `state → auth → taint → business`. Within `business`, place
 * REWRITE-style guards before ESCALATE-style guards so threshold
 * comparisons see the rewritten payload.
 */

// ─── Domain types ──────────────────────────────────────────────────────────

export type {{className}}IntentKind =
  | "{{intentPrefix}}.demo.create"
  | "{{intentPrefix}}.demo.confirm";

export interface {{className}}State {
  /**
   * Replace with the real state shape your guards inspect.
   * Examples: `Map<string, Order>`, `Map<string, Charge>`, a config tree.
   */
  readonly entities: ReadonlyMap<string, unknown>;
}

export interface {{className}}Context {
  /** Adopter-supplied request context — tenancy, locale, principal id, etc. */
  readonly tenantId: string;
}

// ─── Tool classification ───────────────────────────────────────────────────
//
// Every tool the LLM might see must be classified READ_ONLY (safe to
// expose for any state) or MUTATING (must be gated by the planner +
// the kernel). `safePlan` enforces that MUTATING tools never leak into
// the planner's `visibleReadTools` output — load-bearing security.

const TOOLS: ReadonlyArray<ToolClassification> = [
  { name: "list_demo", classification: "READ_ONLY" },
  { name: "create_demo", classification: "MUTATING" },
  { name: "confirm_demo", classification: "MUTATING" },
];

// ─── Capability planner ────────────────────────────────────────────────────
//
// Decides what the LLM may see at each (state, context) snapshot. The
// `safePlan` wrapper around the raw planner enforces that no MUTATING
// tool ever appears in `visibleReadTools`.

const rawPlanner: CapabilityPlanner<{{className}}State, {{className}}Context> = {
  plan(_state, _context) {
    const allTools = ["list_demo", "create_demo", "confirm_demo"];
    return {
      visibleReadTools: filterReadOnly(TOOLS, allTools),
      allowedIntents: [
        "{{intentPrefix}}.demo.create",
        "{{intentPrefix}}.demo.confirm",
      ],
      forbiddenConcepts: [],
    };
  },
};

export const planner = safePlan(rawPlanner, TOOLS);

// ─── Taint policy ──────────────────────────────────────────────────────────
//
// Confirmation operations require TRUSTED taint (operator-initiated,
// not LLM-proposed). Creation tolerates UNTRUSTED. Customize per your
// security model.

const taint: TaintPolicy = {
  minimumFor(kind) {
    if (kind === "{{intentPrefix}}.demo.confirm") return "TRUSTED";
    return "UNTRUSTED";
  },
};

// ─── Guards ────────────────────────────────────────────────────────────────
//
// Each guard returns a Decision (EXECUTE / REFUSE / DEFER / ESCALATE /
// REQUEST_CONFIRMATION / REWRITE) when it has an opinion, or `null` to
// pass to the next guard.

const allowDemoCreate: Guard<
  {{className}}IntentKind,
  unknown,
  {{className}}State
> = (envelope) => {
  if (envelope.kind !== "{{intentPrefix}}.demo.create") return null;
  return decisionExecute([
    basis("state", "transition_valid", { intent: "demo.create" }),
  ]);
};

const allowDemoConfirm: Guard<
  {{className}}IntentKind,
  unknown,
  {{className}}State
> = (envelope) => {
  if (envelope.kind !== "{{intentPrefix}}.demo.confirm") return null;
  return decisionExecute([
    basis("state", "transition_valid", { intent: "demo.confirm" }),
  ]);
};

// ─── PolicyBundle ──────────────────────────────────────────────────────────

export const policy: PolicyBundle<
  {{className}}IntentKind,
  unknown,
  {{className}}State
> = {
  stateGuards: [],
  authGuards: [],
  taint,
  business: [allowDemoCreate, allowDemoConfirm],
  default: "REFUSE",
};
