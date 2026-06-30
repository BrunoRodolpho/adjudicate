---
"@adjudicate/web": patch
---

marketing(web): 133 — reconcile overstated marketing copy to code-truth.

Copy-only. No kernel, runtime, response-shape, component-logic, or data-enum
changes; invariants preserved by construction. Driven by the marketing-site
fact-check audit (`ADJUDICATE_MARKETING_AUDIT.md`): of 70 public claims, 18 were
OVERSTATED and 2 STALE, all the same pattern — built-but-inert / default-OFF /
unpublished mechanisms presented as always-on. Each fix is scoped to what the
running code enforces, propagated to sibling surfaces so the site stays
self-consistent, and re-reviewed against a safe-claims vocabulary.

- **AuditChain.tsx / ConstitutionalKernelMap / MagicMomentSplit (C15/C16).**
  The inter-record `prevAuditHash` chain is built-but-inert (never threaded;
  every record genesis as-built). Reframed "every decision *is* a link in a
  cryptographic chain" → records *can be* chained; separated byte-for-byte
  re-derivation (catches modification) from the chain (catches delete/reorder).
- **AdjudicantPlane.tsx (C20).** "read-only … 35 queries, 0 mutations" →
  "write-isolated … 36 read queries plus exactly one friction-monotone write
  (escalate.raise)", matching the repo's own write-isolation acceptance test.
- **TrustRoot / Capabilities / KernelTrace / UseCases (C06/C18).** The
  capability gate is default-OFF and unwired; minting reframed from the always-on
  execution gate to an available, off-by-default hardening, and the rendered
  token shape corrected to the real `Capability` type
  (`{ intentHash, kernelId, signature }`); "budgeted" footnoted as the separate
  standing operator budget.
- **SixOutcomes / DecisionsGrid / ComparisonPreamble / WedgeTable / blog
  (C14/C42).** "OPA and Cedar can't express" → Cedar returns binary Allow/Deny;
  OPA emits arbitrary JSON but ships no REWRITE re-adjudication or DEFER
  park-and-resume.
- **KernelGuards / primitives / llms-full (C08/C33).** `intentHash` now lists all
  eight content fields (adds `nonce`, `origin`, `resourceRefs`); "no replay"
  scoped to "replays suppressed when an Execution Ledger is wired".
- **capabilities.ts (C46/C44/C47).** AI-BOM "signed" → "signable, digest-pinned";
  command-risk redaction scoped to adjudicate's own surfaces (not "never on any
  surface"); token-budget "hard ceiling" → "bounded" with the metering/telemetry
  preconditions stated.
- **AnnouncementBanner / site.ts / FAQ / roadmap / contribute / llms (C60/C58/
  C59/C61).** "production-ready & API-frozen" / "public API is frozen" →
  "published to npm, API-stable (additive-only)" / "load-bearing, wire-bearing
  surface frozen"; `coreVersion` 1.3.0 → 1.7.0; freeze callout scoped to the
  enforcing version-pin gate vs the advisory export-completeness gate.
- **llms.txt / llms-full.txt / layout / StepActs (C31).** "signed" receipts →
  "tamper-evident, replay-verifiable (optional signature)"; "Every AI action" →
  "Every state-mutating AI action".
- **architecture (under-claimed mechanisms).** Added a clearly-labelled
  "shipping in the v1.8 line" section surfacing four genuinely-built mechanisms
  (non-forgeable RenderedReply/CanonicalClaim brands, the C6 over-claim guard,
  the fail-closed ClaimDefinition validator, soundness-monotone extensibility) —
  scoped as designed/forthcoming, never as live behaviour on the current model.

Intentionally preserved: the persisted-backend "signed receipts" (WhoItsFor,
blog) and the already-scoped optional-signature copy (FAQ), per the prior
keyless-receipt reconciliation.
