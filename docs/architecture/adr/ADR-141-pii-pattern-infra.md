# ADR-141 — PII pattern registry, input cap, out-of-path SHADOW (amends ADR-117)

- **Status:** Accepted
- **Date:** 2026-06-17
- **Scope:** `@adjudicate/primitives` (`PII_PATTERNS_COMMON`, `assertSafePattern`, `DataClassificationGuardOptions.maxInputLength`, `createDataClassificationShadowProvider`), new `@adjudicate/locales-en-US`, `@adjudicate/locales-pt-BR` (CPF/CNPJ)
- **Related:** ADR-117 (data-classification guard), ADR-129 (PII events read seam), ADR-124 (metadataProvider seam)

## Context

ADR-117 shipped `createDataClassificationGuard` but adopters had to hand-author every pattern, the matcher had no input cap (ReDoS exposure on untrusted input), and there was no observe-only mode for staged rollout. The original enhancement report listed "locale-aware patterns" as a gap *to build* — an earlier draft wrongly claimed CPF/CNPJ/SSN already shipped in locale packages (they did not).

## Decision

- **`PII_PATTERNS_COMMON`** — authored email/PAN/phone patterns, anchored/bounded/linear-time, self-checked at import.
- **`assertSafePattern(pattern, label?)`** — construction-time ReDoS guard. Heuristically rejects nested unbounded quantifiers (`(a+)+`, `(.*)*`, `([a-z]+){2,}`) after neutralizing escaped chars. Every guard pattern is checked at construction.
- **`DataClassificationGuardOptions.maxInputLength`** — skip scanning oversized fields (fail-open on size); redaction is now gated on a per-pattern match.
- **`createDataClassificationShadowProvider(...)`** — observe-only PII detection that rides the **post-decision `metadataProvider` seam** (hash-excluded), attaching `{ pii_shadow_detected, … }` only on a match and returning `undefined` otherwise. It is **NOT** a Decision.
- **New `@adjudicate/locales-en-US`** (SSN) + **`@adjudicate/locales-pt-BR`** CPF/CNPJ — authored, format-only, `@needs-legal-review`. Typed structurally so locale packages take no dependency on `primitives`.

## Why this shape

- **SHADOW must stay OUT of the decision path.** Modelling SHADOW as a "no-op REWRITE" is unsafe: the loop treats REWRITE as authoritative execute-the-rewritten-envelope with no re-adjudication, and guards short-circuit on first non-null — so a SHADOW REWRITE would force-execute the (unredacted) payload and skip later REFUSE guards. The metadata-seam realization is behaviorally neutral by construction.
- **ReDoS at construction, not request time.** Unsafe patterns throw when the guard is built, never under load.

## Invariants preserved

- `adjudicate()` unaffected — SHADOW is post-decision telemetry; the enforcing guard remains pure `(envelope, state) ⇒ Decision | null`. No new Decision kind. SHADOW emits no Decision basis (it is metadata), so byte-identical `auditHash` pre-images for clean records.

## Alternatives considered

- **`action: "SHADOW"` on the guard.** Rejected (see Why) — observe-only cannot be a Decision variant.
- **Runtime regex-engine swap.** Rejected — non-deterministic, IO-shaped; the anchored/bounded patterns + `assertSafePattern` keep matching linear without an engine change.

## Test coverage

`packages/primitives/tests/pii-patterns.test.ts` (assertSafePattern throws on nested quantifiers; no false positives on shipped patterns; positive/negative matches). `data-classification.lifecycle.test.ts` (`maxInputLength` skip; ReDoS reject at construction; SHADOW attaches metadata **without** a Decision; `undefined` on clean records). Locale pattern tests (en-US, pt-BR).

## Lifecycle

Phase 1: registry + ReDoS guard + cap + SHADOW provider + locale patterns (require legal vetting before regulated use). Phase 3: SHADOW→enforce promotion; optionally extend `PiiDispositionSchema` (ADR-129) with a `'detected'` value so the `/transparency/pii` view can represent observe-only detections.
