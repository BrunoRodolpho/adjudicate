# ADR-130 — AI-BOM Explorer (multi-pack list/detail + public transparency view)

- **Status:** Accepted
- **Date:** 2026-06-07
- **Scope:** `@adjudicate/admin-sdk` (`pack.aiBomList`/`pack.aiBomById` + `AiBomSummary`/`AiBomListResult`/`AiBomByIdQuery` schemas + pinned `AiBomToolRef`/`AiBomRagRef` element schemas + `AdminContext.aiBoms?`), apps/console (AI-BOM Explorer page), apps/web (public AI-BOM transparency view).
- **Related:** ADR-127 (the BOM *producer* — `generateAiBom`/`computeBomDigest` in `@adjudicate/conformance`), ADR-128 (web-parity platform / dual-app transparency contract).

## Context

ADR-127 shipped the BOM producer and a thin consumer: `pack.aiBom` feeding a single SUMMARY CARD on the console. Two gaps remained: (1) the console panel is single-pack and surfaces only pack@version/model/conformance/health/a 16-char fingerprint slice — the richest regulator-relevant fields (`promptHashes`, `tools`, `rag`, full `fingerprint`/`bomDigest`, guardrails) are shipped over the wire but never rendered, and there is no cross-pack browser even though the console registers five Packs; (2) `apps/web` has no BOM surface at all, even though the BOM is the one governance artifact that is non-sensitive by design (hashes + component references, never contents) and is the ideal candidate for a public EU AI Act / NIST AI RMF transparency view.

## Decision

- **`pack.aiBomList`** (new tRPC query) → `AiBomListResultSchema` (`{ boms: AiBomSummary[] }`). One cheap summary per wired Pack (packId@version, model, healthTier, healthScore, conformance pass/passedCount/total, fingerprint, bomDigest, frameworks, generatedAt, `signed`). PRECONDITION_FAILED when no BOMs are wired; falls back to `[ctx.aiBom]` when only the legacy single BOM is configured (back-compat).
- **`pack.aiBomById`** (new tRPC query, input `{ packId, packVersion? }`) → full `AiBomSchema`. NOT_FOUND on no match; PRECONDITION_FAILED when no BOMs are wired. When `packVersion` is omitted, returns the **deterministic latest** (semver-max, `bomDigest` tiebreak — no wall-clock).
- **`AdminContext.aiBoms?: ReadonlyArray<AiBomParsed>`** — the multi-pack set. The existing `aiBom?` is kept unchanged. The adopter computes `generateAiBom(...)` per `PackRegistry.all()` entry with a SINGLE shared `generatedAt` literal.
- **Schema tightening:** `AiBomSchema.tools`/`.rag` element shapes pinned to `AiBomToolRefSchema`/`AiBomRagRefSchema` (previously permissive `z.record(z.string(), z.unknown())`). The producer already only ever emits these fields, so this is an additive validation tightening within `bomVersion "1.0"` — not a wire-format change.
- **Auth posture:** like `pack.aiBom`, the new procedures require NO actor (the BOM is non-sensitive). The signature VALUE is never surfaced — the list carries only `signed: boolean`.
- **Console:** a dedicated `/ai-bom` page — a two-pane Explorer (left rail from `aiBomList`, detail from `aiBomById`) surfacing model, intents/signals/basisCodes, tools, vector stores, prompt hashes, guardrails, conformance, health, full fingerprint + bomDigest, plus a per-BOM "Download JSON". A new Sidebar item ("AI-BOM").
- **Web:** a public, read-only `/transparency/ai-bom` view fed by a committed *illustrative* fixture (`AI_BOM_TRANSPARENCY_SAMPLE`) projected through `sanitizeBomForPublic` — an **allowlist** projection that copies only named fields and collapses any `signature` to `signed: boolean`.

## Why this shape

- **Additive, pattern-matched.** New `pack.*` read procedures mirror `pack.aiBom`'s context-read + PRECONDITION_FAILED idiom; no new store, no kernel change, no producer change (`@adjudicate/conformance` already emits every field the Explorer needs).
- **Non-sensitive by construction + defense in depth.** The BOM is hashes and references, never contents (ADR-127). The public view additionally allowlists fields (future fields excluded by default) and drops the signature value. Author-controlled strings (`tools[].description`, `rag[].name`) are rendered as inert text only — no `dangerouslySetInnerHTML`.
- **Deterministic everywhere.** A single shared `generatedAt` per generation keeps the set reproducible; `aiBomById`'s "latest" pick is semver-max with a `bomDigest` tiebreak (no clock). `bomDigest` already excludes `generatedAt`/`signature`, so the digest is stable across builds.

## Invariants preserved

- Determinism/replay untouched — the BOM is a read-model projection outside the determinism/taint boundary; it never feeds `adjudicate()`/`intentHash`/decisions and cannot launder a taint transition. No clock/RNG in the new handlers (the only timestamp is the adopter-supplied `generatedAt`, excluded from the digest).
- No closed-enum widening (`AiBomFramework`/`AiBomVersion`/`AiBomGuardrail.category` unchanged). No kernel/wire/canonical-hash recipe change — tightening `tools`/`rag` Zod elements is a read-side validation change, not a byte-format change. Additive MINOR on `@adjudicate/admin-sdk`.

## Test coverage

`packages/admin-sdk/tests/ai-bom-trpc.test.ts` — `toAiBomSummary` (signed derivation, no value leak, no heavy arrays), `pickLatestAiBom` (semver-max, digest tiebreak), pinned element schemas (accept producer output, reject missing required), and the three procedures (list summaries + back-compat fallback + PRECONDITION_FAILED; byId match / version filter / deterministic latest / NOT_FOUND incl. path-traversal-shaped input). Console `/ai-bom` page component test (rail, signed badge, detail fields, selection, empty/loading, per-section "None declared"). Web `ai-bom-transparency` projection test (allowlist drops injected secret/raw-prompt fields, signature collapsed to `signed`, only allowlisted keys, determinism).

## Lifecycle

New `@adjudicate/admin-sdk` symbols (`pack.aiBomList`/`pack.aiBomById`; `AiBomSummarySchema`/`AiBomListResultSchema`/`AiBomByIdQuerySchema`/`AiBomToolRefSchema`/`AiBomRagRefSchema` + inferred types; `toAiBomSummary`/`pickLatestAiBom`; `AdminContext.aiBoms?`) ship in the combined WS3 MINOR wave with `.changeset/ai-bom-explorer.md` and V1_FREEZE_MATRIX rows (added in the Phase-E backfill — not in this PR). Console/web are app-only. The `sanitizeBomForPublic` allowlist is an app-level contract in `apps/web`: any new BOM field must be consciously added to it with a "is this safe to publish?" sign-off.
