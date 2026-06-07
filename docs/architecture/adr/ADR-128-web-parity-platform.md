# ADR-128 — Cross-cutting web-parity platform

- **Status:** Accepted
- **Date:** 2026-06-07
- **Scope:** apps/console (UI primitives, chart kit, a11y primitives, responsive shell, SSE live tail), apps/web (public transparency contract), e2e (Playwright). No published-package symbols of its own.
- **Related:** ADR-114 (kill switch / AuditEventBus), ADR-119 (drift — live feed), and the WS3 surface ADRs 129–136 that build on this foundation. Design doc: `docs/roadmap/design/_cross-cutting-platform.md`.

## Context

Phase-3 of the roadmap requires every governance capability to have first-class visibility in the web application, with loading/empty/error states, accessibility, responsive layouts, component tests, and a real-time view — across **both** apps: the operator console (`apps/console`) and a public, read-only surface on the marketing site (`apps/web`). The eight governance surfaces (PII, AI-BOM, Config-Integrity, Drift, Red-Team, Command-Risk, Token, Approvals) all depend on the same foundation, which did not exist: no shared state primitives, no charting, no systematic a11y, a fixed non-responsive grid, and a 2-second polling live tail with the `AuditEventBus` wired nowhere.

## Decision

- **Dual-app contract.** `apps/console` is the full authenticated operator tool. `apps/web` is public and exposes **aggregates only**, built field-by-field through an allowlist projection (`apps/web/src/lib/public-projection.ts`) with a small-cohort floor (`<5`) so low-volume deployments can't be de-anonymized. The public surface consumes **app-local Next routes**, never the authenticated `adminRouter`.
- **Real-time tail = SSE + polling fallback.** `bridgeAuditSinkToBus` → a Redis-backed `AuditEventBus` (only when `REDIS_URL` is set — a real kernel publishes there) → an SSE endpoint (`/api/admin/stream`) → `useLiveTail` consumes it via a `fetch`-stream so it can detect the `501` "no live bus" signal and fall back to 2-second polling. The drift detector `attach`es to the same bus for a live feed. This mirrors the kill-switch's Redis-or-fallback posture.
- **Shared UI/a11y/chart primitives stay app-local** (`components/ui`, `components/charts`, `components/a11y`) — no extracted `@adjudicate/ui` package this wave.
- **Charts are bespoke, zero-dependency SVG** with a visually-hidden `<table>` text alternative per chart (no charting library added).
- **a11y baseline:** skip-link as first focusable element, focusable `<main id="main-content">`, `DataTable` with `<caption>`/`scope`, a polite `aria-live` announcer for live-tail changes, collapsible/responsive nav.
- **E2E:** Playwright harness driving both real apps (`pnpm e2e`), wired into CI (`e2e.yml`).

## Why this shape

- **Honest real-time.** The reference console has no in-process record producer, so an in-memory bus would fan out nothing. SSE is the real transport when a kernel publishes to Redis; polling remains the truthful fallback. The `501`-detection (rather than `EventSource`, which can't read HTTP status) is what makes the fallback clean.
- **Public-safe by construction.** An allowlist projection plus a cohort floor means the public surface can never leak raw PII, commands, prompts, tokens, ids, hashes, actors, or individual decisions — the projection builds the public shape explicitly rather than redacting a rich object.
- **App-local over a shared package.** Extracting `@adjudicate/ui` would add a published surface (freeze-matrix section + ADR + changeset) for no adopter demand; duplication across two apps is cheaper than the governance overhead this wave.

## Invariants preserved

- **Determinism / replay.** The bus is best-effort fan-out; the durable sink stays the source of truth and the kernel never reads the bus. Nothing here is a kernel input. No wire-format or canonical-hash change.
- **No closed-enum widening, no new published-package symbols** — entirely app code + devDeps + CI.
- **Fail-closed auth** is shared (`lib/admin-auth.ts`) by both the tRPC route and the SSE stream.

## Alternatives considered

- **WebSocket instead of SSE.** Rejected for the tail — SSE is one-directional (server→client), natively reconnecting, proxy-friendly, and sends cookies same-origin; a WebSocket adds a bidirectional channel the tail doesn't need.
- **A public tRPC subset for `apps/web`.** Rejected — app-local Next routes keep the public surface trivially auditable and decoupled from the operator router.
- **Adopt a charting library.** Rejected — bundle weight + a11y opacity; the existing bespoke-SVG approach already proves out.

## Test coverage

`apps/console`: 35 UI-primitive tests, 27 chart tests, a11y-primitive tests, `useLiveTail` SSE/fallback tests, `ShellBody` + `LiveTailAnnouncer` tests (134 console tests total). `apps/web`: `public-projection` cohort-floor tests. `e2e/`: Playwright smoke specs (skip-link, nav collapse, transparency contract) — runnable via `pnpm e2e` after `pnpm e2e:install`.

## Lifecycle

App-only; no version bump or changeset. The WS3 surface ADRs (129–136) layer their data surfaces on this foundation and carry their own changesets + freeze-matrix rows.
