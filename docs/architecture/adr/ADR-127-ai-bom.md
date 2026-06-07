# ADR-127 — AI Bill-of-Materials (AI-BOM) generator

- **Status:** Accepted
- **Date:** 2026-06-06
- **Scope:** `@adjudicate/conformance` (`generateAiBom` + manifest fields), `@adjudicate/cli` (`pack bom`), `@adjudicate/admin-sdk` (`pack.aiBom`), apps/console (AiBomPanel)
- **Related:** ADR-115 (fingerprint), ADR-110 (conformance), ADR-117..125 (the components a BOM inventories)

## Context

Regulators (EU AI Act Art. 11 technical documentation; NIST AI RMF MAP/MEASURE) and supply-chain security want a machine-readable manifest of the AI components in a Pack deployment: model, prompts, tools, retrieval sources, guardrail taxonomy, conformance status, fingerprint.

## Decision

- **`generateAiBom(inputs)`** in `@adjudicate/conformance` — a **pure** function composing `computePackFingerprint` + `runConformance` + `scorePackHealth` + manifest + author-declared model/prompt/tool/RAG metadata into an `AiBom`. `generatedAt` and any `signature` are caller-supplied; `bomDigest` is computed over everything EXCEPT those two, so it's reproducible and signable.
- **`PackManifest`** gains additive optional `modelVersion` / `promptHashes` / `tools` / `rag`.
- **CLI** `adjudicate pack bom <path>` (loads pack, runs conformance + health, emits the BOM JSON). **Console** `pack.aiBom` + a downloadable `AiBomPanel`.

## Why this shape

- **Composition over reinvention.** The BOM is a deterministic view over primitives that already exist; it adds no new decision logic.
- **`generatedAt` excluded from `bomDigest`.** Two BOMs of the same Pack at different times share a `bomDigest` (what gets signed / CI-gated); unit tests assert the digest is invariant to `generatedAt` and to input array order. The array comparators are total-order (equal keys sort to a stable position) so duplicate keys cannot perturb the digest. These are example-based unit tests, not fast-check property tests (the conformance package has no fast-check dependency).
- **Prompts aren't in the Pack.** `promptHashes` are author-declared (sidecar-hashed), framed as "declared prompt templates," not rendered prompts.
- **No kernel change.** `PackV0` is untouched; manifest fields are additive optional; conformance is a leaf consumer of core.

## Invariants preserved

- Kernel determinism: the generator never touches `adjudicate()` / `intentHash`. Pure (no clock/RNG/I/O); the only wall-clock value is the caller-supplied `generatedAt`.

## Alternatives considered

- **Live prompt introspection via PromptRenderer.** Rejected — prompts are runtime-rendered (need state/context).
- **Extend `PackV0` with BOM fields.** Rejected — would require a contract bump and pollute the kernel type.
- **Adopt CycloneDX-ML / SPDX-AI as the wire format.** Deferred — heavyweight/evolving; `bomVersion` reserves a future projection.

## Test coverage

`packages/conformance/tests/ai-bom.test.ts` (composition, guardrail derivation, tools-from-intents default, digest reproducibility + generatedAt-exclusion + array-order-insensitivity, tampered-prompt-hash flips digest). `packages/cli/tests/pack-bom.test.ts` (PIX BOM via CLI). apps/console AiBomPanel test.

## Lifecycle

`bomVersion: "1.0"`; additive fields are MINOR, a `bomVersion` bump is MAJOR. Manifest field additions are conformance MINOR. Durable signing + a CycloneDX projection are documented follow-ups.
