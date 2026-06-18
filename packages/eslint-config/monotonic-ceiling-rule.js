// @adjudicate/eslint-config — custom ESLint rule: `monotonic-ceiling`.
//
// 061 · Monotonic escalation (index §C / invariant #7). §C: every NON-
// deterministic subsystem (risk/anomaly/compliance/ops code) "may only increase
// friction, never decrease it" and "only deterministic rules can authorize
// EXECUTE". The canonical violation is WEAKENING an already-decided Decision —
// reassigning the kernel's `decision` binding to a strictly LESS restrictive
// outcome, above all to `decisionExecute(...)` (the unique minimum, EXECUTE, of
// the restrictiveness lattice EXECUTE < REWRITE < REQUEST_CONFIRMATION < DEFER <
// ESCALATE < REFUSE).
//
// This rule flags that anti-pattern: reassigning a `decision`-bound variable to a
// `decisionExecute(...)`/`{ kind: "EXECUTE" }` value (a friction-DECREASING
// composition). The ONE legitimate occurrence — the deterministic confirmation-
// receipt substitution in `adjudicate-and-audit.ts` (§C carve-out: a content-
// addressed user receipt is a deterministic input, not a risk model lowering a
// ceiling) — is allowlisted at its call site with an `eslint-disable-next-line
// @adjudicate/monotonic-ceiling` directive.
//
// Scope note (plan §7): the shared config that registers this rule runs under
// `@adjudicate/core`'s eslint lint; `@adjudicate/drift`'s lint is `tsc --noEmit`
// only, so the rule does not yet run against drift (drift's monotonic contract is
// pinned by a runtime test instead — see T5). The rule is therefore EFFECTIVELY
// ADVISORY for non-core packages until drift adopts eslint.

/** @type {import("eslint").Rule.RuleModule} */
const monotonicCeiling = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid weakening an already-decided Decision to a less-restrictive outcome (EXECUTE) — non-deterministic components may only increase friction (index §C / invariant #7).",
      recommended: true,
    },
    schema: [],
    messages: {
      weaken:
        "Monotonicity (§C): reassigning a `decision` binding to {{to}} weakens an already-decided outcome to less friction. Only deterministic rules may authorize EXECUTE; a non-deterministic ceiling may only RAISE friction. If this is a deterministic kernel/shell flow (e.g. the confirmation-receipt substitution), allowlist it with `// eslint-disable-next-line @adjudicate/monotonic-ceiling`.",
    },
  },

  create(context) {
    // Is this AST node an EXECUTE-authorizing value? Either a call to the
    // `decisionExecute` constructor or an object literal `{ kind: "EXECUTE" }`.
    function authorizesExecute(node) {
      if (!node) return false;
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "decisionExecute"
      ) {
        return true;
      }
      if (node.type === "ObjectExpression") {
        return node.properties.some(
          (p) =>
            p.type === "Property" &&
            !p.computed &&
            ((p.key.type === "Identifier" && p.key.name === "kind") ||
              (p.key.type === "Literal" && p.key.value === "kind")) &&
            p.value.type === "Literal" &&
            p.value.value === "EXECUTE",
        );
      }
      return false;
    }

    // The kernel decision binding by convention is named `decision`. We flag a
    // REASSIGNMENT (not the initial declaration) of such a binding to an
    // EXECUTE-authorizing value — the friction-DECREASING weakening flip.
    function targetsDecisionBinding(left) {
      return (
        (left.type === "Identifier" && left.name === "decision") ||
        (left.type === "MemberExpression" &&
          !left.computed &&
          left.property.type === "Identifier" &&
          left.property.name === "decision")
      );
    }

    return {
      AssignmentExpression(node) {
        if (node.operator !== "=") return;
        if (!targetsDecisionBinding(node.left)) return;
        if (!authorizesExecute(node.right)) return;
        const to =
          node.right.type === "CallExpression"
            ? "decisionExecute(...)"
            : '{ kind: "EXECUTE" }';
        context.report({ node, messageId: "weaken", data: { to } });
      },
    };
  },
};

export default monotonicCeiling;
