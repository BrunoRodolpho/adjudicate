# Guide: PII observe-then-enforce rollout

> WS-C / ADR-117 / ADR-141 §4.6. Worked example:
> [`packages/primitives/tests/data-classification.observe-then-enforce.test.ts`](../../packages/primitives/tests/data-classification.observe-then-enforce.test.ts).

A safe data-classification rollout runs in two phases over the **same** config:

1. **Observe** — detect PII out-of-path and record it, without changing any
   `Decision`. Use [`createDataClassificationShadowProvider`](../../packages/primitives/src/guards.ts).
2. **Enforce** — promote the same patterns/fields to an in-path
   [`createDataClassificationGuard`](../../packages/primitives/src/guards.ts) that
   `REWRITE`s (masks) or `REFUSE`s on detection.

## The flip

The provider and the guard take the same classification options, so promotion
is a config change, not a rewrite:

```ts
// One config, shared verbatim between observe and enforce.
const classification = {
  patterns: [{ id: "ssn", pattern: /\d{3}-\d{2}-\d{4}/ }],
  scannedFields: ["note"],
  sensitivityLevel: "high",
} as const;

// Phase 1 — OBSERVE (out-of-path; never changes a Decision):
const { metadataProvider } = createDataClassificationShadowProvider(classification);
// wire into adjudicateAndAudit({ metadataProvider }); detection rides
// hash-EXCLUDED metadata: { pii_shadow_detected, pii_shadow_fields, pii_shadow_sensitivity }.

// Phase 2 — ENFORCE (in-path guard in your guard chain):
const guard = createDataClassificationGuard({
  ...classification,
  matches: (env) => env.kind === "support.ticket.create",
  action: "REWRITE", // mask matched fields  (or "REFUSE" to block the turn)
});
```

`action: "REWRITE"` emits `validation.pii_redacted`; `action: "REFUSE"` emits
`validation.pii_blocked`. (Observe-only `"SHADOW"` is intentionally **not** a
guard action — modelling it as a no-op REWRITE would force-execute the payload
and skip later guards; ADR-141 §4.6. Use the shadow provider instead.)

## Already visible — no schema/UI change

The enforce path emits the basis codes the admin-sdk PII handlers already
project, so the existing transparency view shows enforce events with no change:

| guard `action` | basis code (`@adjudicate/core` `BASIS_CODES.validation`) | admin-sdk disposition |
| --- | --- | --- |
| `REWRITE` | `PII_REDACTED` → `"pii_redacted"` | `"redacted"` |
| `REFUSE`  | `PII_BLOCKED`  → `"pii_blocked"`  | `"blocked"` |

Projection lives in `packages/admin-sdk/src/handlers/{pii-events,pii-classification}.ts`
(both read `record.decision_basis`). The `data-classification.observe-then-enforce`
test pins that the guard emits exactly these strings.

## Behavior changes when you flip to enforce — read before rollout

1. **Audit hashes shift for matching payloads.** SHADOW detection rides the
   post-decision `metadataProvider` seam, which is **hash-excluded**. The
   enforcing guard changes the `Decision` itself (REWRITE re-emits a masked
   envelope; REFUSE blocks), which is **hash-included**. So intent hashes,
   audit records, and any golden/replay fixtures move for every payload that
   matches. This is the point of observe→enforce — but baselines change, so
   re-baseline determinism fixtures as part of the flip.
2. **REWRITE does not declassify.** The rewritten envelope preserves `taint`
   verbatim — redaction removes content, it does **not** lower the trust level.
   A tainted-source policy still applies to a redacted payload.
3. **`maxInputLength` is fail-open on size.** Any scanned field whose value
   exceeds `maxInputLength` is **skipped, not scanned** — oversized,
   attacker-controlled free text bypasses redaction/refusal. Set
   `maxInputLength` deliberately (it is a ReDoS backstop, not a correctness
   bound) and keep patterns linear; `assertSafePattern` is a heuristic, not a
   proof.

## Human gate — legal/compliance vetting

The CPF/CNPJ/SSN/common patterns are flagged `@needs-legal-review`. Vet the
pattern set with legal/compliance before any production or regulated use; a
false negative leaks regulated data and a false positive masks legitimate
input. This gate is outside the kernel's determinism boundary and is the
adopter's responsibility.

## Optional follow-up (deferred — decision L-C1)

Surfacing observe-only SHADOW detections (`record.metadata.pii_shadow_detected`)
in the transparency view is deferred. Today the basis-projection handlers read
only `decision_basis`, so shadow metadata is invisible by design. If operators
later want it, add a **separate** metadata-reading projection plus a `"detected"`
`PiiDisposition` value — do **not** add metadata reads to the basis-projection
handlers.
