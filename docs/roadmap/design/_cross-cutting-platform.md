# Cross-Cutting Platform / Foundation — Design

> Status: Draft (Phase-1 design, pending approval) · Roadmap: WS3 Web Parity · Target apps: console + web
>
> This is the **foundation layer** that all eight governance surfaces
> (Audit/Live-Tail, Behavioral Drift, Red-Team, AI-BOM, Command-Risk,
> Configuration-Integrity, PII-Events, Policy-Coherence/Hallucination) sit
> on top of. The per-surface design docs in this directory
> (`behavioral-drift.md`, `red-team-results.md`, `ai-bom-explorer.md`,
> `command-risk.md`, `configuration-integrity.md`, `pii-events.md`) assume
> the contracts defined here. Read this first.

---

## Scope & non-goals

This doc designs six cross-cutting concerns: (1) dual-app data strategy,
(2) real-time tail migration, (3) accessibility, (4) responsive layout,
(5) shared UI primitives + charting, (6) test/E2E harness. It is **design
only** — no source code is written here. Every claim about current
behaviour is grounded against the repo (file paths + line references
inline).

**Locked decisions this doc respects (do not relitigate):**

- **Dual-app split.** `apps/console` = full operator tool (bearer auth,
  per-operator identity, mutations). `apps/web` = public, read-only,
  aggregates-only transparency demo.
- **Frozen v1 line.** Additive-only; no major bumps; closed enums stay
  closed; wire-format & canonical-hash recipe append-only
  (`docs/release/V1_FREEZE_MATRIX.md`, `EXTENSION_POLICY.md`,
  `SEMVER_GOVERNANCE.md`, ADR-116).
- **Determinism boundary.** Telemetry (token usage, drift snapshots,
  red-team history, live-tail bus) lives OUTSIDE the kernel; it is never a
  kernel input; no wall-clock / RNG on deterministic paths.
- **Sequencing.** Parity-first, ship-together: WS3's new backend surfaces
  build now and their changesets/ADRs/freeze-matrix rows join the existing
  **15 staged changesets** (`.changeset/*.md`, confirmed 15) in ONE
  combined post-v1 **MINOR** wave. New packs go stable at **0.2.0**.

---

# 1 · Dual-app strategy

## 1.1 Current state (cited)

- **`apps/console`** is the reference operator console. Its data path is
  tRPC v11 → `@adjudicate/admin-sdk` `adminRouter` mounted at
  `/api/admin/trpc/[trpc]/route.ts` via `toNextRouteHandler` (imported
  from `@adjudicate/admin-sdk/adapters/next`, line 37). Auth is
  **fail-closed bearer** keyed on `process.env.ADMIN_API_TOKEN` (route
  lines 73–91: "It is fail-CLOSED in production: with no token … refuses
  to mount"); actor identity is extracted from `x-adjudicate-actor-*`
  headers via `extractActor` (line 4, 129). The client binds to the
  `AuditGateway` interface via a module-level singleton
  (`apps/console/src/lib/gateway/client.ts`); the tRPC URL is fixed in
  `lib/trpc-client.ts`. All eight governance surfaces exist here in
  partial form (`src/components/governance/*`, `src/components/dashboard/*`).
- **`apps/web`** is the marketing site + interactive demo playground. It
  has **no governance dashboards** — `src/sections/ConsolePreview.tsx` is
  a 100% static marketing card (no data). It mounts an **unused** React
  Query `QueryClient` (`src/app/providers.tsx`). It has **no auth/tenant
  model and no charting lib**. Crucially, where the web app *does* surface
  live framework data today (the homepage GuardMetadata graph), it does
  **not** reach `adminRouter` — it imports the feature packages directly
  inside a Next route handler and serves hand-rolled JSON:
  `src/app/api/playground/policy/route.ts` (`runtime = "nodejs"`,
  `dynamic = "force-static"`) calls `describePolicyBundle(pack.policy)` and
  returns `NextResponse.json({ packs })`. The playground likewise has
  `api/playground/adjudicate` and `api/playground/outcome-distribution`
  route handlers. **This pre-existing pattern is the template for the
  public dashboards.**

## 1.2 Proposed design — the safe-for-public data contract

**Decision: web consumes data via dedicated public Next route handlers in
`apps/web`, NOT via the admin-sdk router.** Three options were weighed:

| Option | Verdict |
|---|---|
| (A) A read-only subset of `adminRouter` behind new "public-safe" tRPC procedures | **Rejected.** It couples the public site to the authenticated governance contract, forces a second auth posture onto a frozen router, and risks a field-leak the day someone adds a procedure that the public allowlist doesn't yet exclude (fail-open by omission). |
| (B) A separate read-only gateway service | **Rejected for v1.** Operationally heavy; nothing in the repo justifies a new deployable. Revisit only if web must show *live* multi-tenant data. |
| (C) **Public Next route handlers in `apps/web` that import feature packages directly and emit a hand-rolled, allowlisted JSON shape** (extend the existing `api/playground/*` pattern) | **Chosen.** Matches the proven `api/playground/policy` precedent, keeps the public surface physically separate from `adminRouter` (it has no token and literally cannot call it), and makes the redaction allowlist a per-route, reviewable artifact. |

**Public route namespace:** `apps/web/src/app/api/public/<surface>/route.ts`
(e.g. `/api/public/drift-status`, `/api/public/red-team-summary`,
`/api/public/ai-bom-overview`). Each is `runtime = "nodejs"` and either
`force-static` (build-time snapshot) or `force-dynamic` with a coarse
`revalidate` (e.g. 300s) — never per-request live operator data.

**The safe-for-public data contract (normative — every public route MUST
satisfy all of these):**

1. **Aggregates only.** Counts, rates, banded severities, distributions
   over *closed low-cardinality vocabularies* (Decision-6 kinds, the 3
   drift dimensions, basis *categories*). Rounded/bucketed where a precise
   number would leak posture.
2. **Never raw PII**, never raw command/payload contents, never prompt
   text, never tokens/secrets, never raw `IntentEnvelope` payloads, never
   `intentHash`-keyed individual records.
3. **No privileged mutations.** Public routes are GET-only. No
   `emergency.update`, no `approval.resolve`, no replay, no kill-switch —
   none of the `*.update`/`*.resolve`/`*.run` surfaces exist on web.
4. **No category *values* from open-ended fields.** Dimension/category
   *names* from closed vocabularies are public; injected category *strings*
   (e.g. a flooded `intent.kind`) are not echoed.
5. **Fail-safe on error.** A public route never surfaces a stack trace,
   a `PRECONDITION_FAILED` "detector not configured" message, or any
   internal copy. On error it serves a neutral "monitoring active" shape.
6. **Allowlist, not denylist.** Each route declares an explicit output
   Zod/TS shape; a field is public only if it appears in that shape. The
   redaction test (see §6) snapshot-fails if any non-allowlisted key
   appears.

**Auth boundary (locked):**

| | `apps/web` (public) | `apps/console` (operator) |
|---|---|---|
| Identity | anonymous / none | bearer (`ADMIN_API_TOKEN`) + per-operator actor (`x-adjudicate-actor-*`) |
| Data path | `apps/web/src/app/api/public/*` route handlers (direct package import) | tRPC → `adminRouter` (`/api/admin/trpc`) |
| Mutations | none (GET-only) | `emergency.*`, `approval.*`, `replay.*` |
| Reaches `adminRouter`? | **never** (no token, no client wiring) | yes |

## 1.3 Determinism / security implications

- **Determinism:** none of this touches the kernel. Public routes read
  the same telemetry read-models the console reads; they never feed
  `adjudicate()`, policy, or state.
- **Security:** the chosen design's strongest property is *physical*
  separation — the public app has no `ADMIN_API_TOKEN`, no tRPC client to
  `/api/admin/trpc`, and serves an explicit allowlist. The threat we are
  defending is a future contributor accidentally widening the public
  surface; the allowlist-only contract + a redaction snapshot test (§6)
  turns that from a silent leak into a failing test.

## 1.4 Release impact

- **No new published-package surface.** Public route handlers and their
  output shapes are **app-only** code in `apps/web`. No changeset, no ADR,
  no freeze-matrix row for the routes themselves.
- **BUT** the *data* each public route serves comes from per-surface
  admin-sdk procedures and/or feature-package functions — those additions
  carry their own surface and are covered in the per-surface docs. The
  cross-cutting governance rule: **a public route may only ever expose a
  strict subset of an already-allowlisted aggregate.**
- One short ADR is warranted to record the dual-app data-contract decision
  itself (option C over A/B) — see the consolidated ADR in §7.

---

# 2 · Real-time tail migration (polling → event bus)

## 2.1 Current state (cited)

- **Polling, three places:**
  - `apps/console/src/hooks/useLiveTail.ts` — `POLL_INTERVAL_MS = 2000`
    (line 8), polls `gateway.queryAudit({ limit: 50 })` every 2s, dedupes
    by `intentHash`, bounded ring of `MAX_RECORDS = 500`. JSDoc explicitly
    flags this as a fallback: "Real-time wire-level streaming (NATS
    WebSocket bridge) is reserved for post-v0.6. This hook ships a
    2-second polling fallback."
  - `apps/console/src/hooks/useApprovals.ts` — `refetchInterval: 2000`.
  - `apps/console/src/hooks/useEmergencyState.ts` — `refetchInterval:
    5_000` (deliberate: kill-switch may flip on another replica).
- **The producer EXISTS but is wired nowhere.**
  `packages/audit/src/event-bus.ts` ships `createInMemoryAuditEventBus`,
  `createRedisAuditEventBus`, `bridgeAuditSinkToBus`, and the
  `AuditEventBus` interface (`publish` / `subscribe(handler) → unsub` /
  `subscriberCount()`). Its own contract docstring is emphatic: best-effort
  / lossy-by-design, durable sink stays source of truth, ordering preserved
  within a bus instance (Redis pub/sub preserves channel order), "The
  kernel never reads the bus." `bridgeAuditSinkToBus` writes the durable
  sink first, awaits success, *then* publishes — a bus failure never rolls
  back the durable write.
- **The console doesn't wire it.** The route handler warms the drift
  detector by **replaying `ALL_MOCKS` at startup** and admits the gap in a
  comment (`apps/console/.../route.ts` ~line 206: "The console has no live
  AuditEventBus, so warm the detector by replaying the mock audit records
  at startup. A real deployment wires `detector.attach(auditEventBus)`
  instead."). The drift detector already has the consumer side:
  `packages/drift/src/detector.ts` `attach(bus) { return bus.subscribe((r)
  => this.observe(r)); }` (lines 212–213).

So the producer (`AuditEventBus`) and the consumer (`DriftDetector.attach`)
both exist; **the wire between them, and the transport out to the browser,
do not.**

## 2.2 Proposed design

```
Kernel adjudicate ──AuditRecord──▶ Durable AuditSink (source of truth, replay)
                                         │ bridgeAuditSinkToBus
                                         ▼
                                   AuditEventBus  ──subscribe──▶ DriftDetector.observe()  (lights up §Drift)
                                         │
                                         │ subscribe (server-side, per connection)
                                         ▼
                              SSE endpoint  GET /api/admin/live/audit  (text/event-stream)
                                         │
                                         ▼
                              useLiveTail subscription  ── polling fallback on disconnect
```

**Transport: Server-Sent Events (SSE), not WebSocket. Recommended +
justified:**

| Criterion | SSE | WebSocket |
|---|---|---|
| Direction needed | server→client only (audit tail is one-way) | bidirectional (unused) |
| Fit with Next 15 App Router | native: a route handler returns a `ReadableStream` with `Content-Type: text/event-stream`; no custom server | needs a separate WS server / upgrade handling outside the App Router |
| Auth reuse | same bearer + actor header path as every other admin route (HTTP request) | handshake auth is more bespoke |
| Auto-reconnect | built into the browser `EventSource` (with `Last-Event-ID`) | hand-rolled |
| Proxy/CDN friendliness | plain HTTP/1.1+ | upgrade can be blocked by intermediaries |
| Backpressure | per-connection stream; server can drop oldest | manual |

The audit tail is strictly server→client; SSE is the smaller, lower-risk
surface and reuses the existing fail-closed HTTP auth. WebSocket's only win
(bidirectional) is unused. **Use SSE.**

**Wiring (console, app-only):**

1. In the route-handler bootstrap, construct one `bus =
   createInMemoryAuditEventBus()` (single replica) or
   `createRedisAuditEventBus(...)` (multi-replica), and wrap the durable
   sink with `bridgeAuditSinkToBus(sink, bus)`. Replace the
   `ALL_MOCKS`-replay warm-up with `detector.attach(bus)` (the live feed
   that lights up Behavioral Drift — see `behavioral-drift.md`). Keep the
   mock replay as a *seed* only when no live adapter is wired.
2. Add `GET /api/admin/live/audit` (a new operator route, behind the same
   bearer+actor auth) that `bus.subscribe(...)`-es per connection and
   writes each `AuditRecord` (already redacted to the console's existing
   field set) as an SSE `data:` frame with a monotonic `id:` for
   `Last-Event-ID` resume.
3. **Rewrite `useLiveTail` to subscribe** via `EventSource` to that
   endpoint, merging into the same dedupe-by-`intentHash` bounded ring it
   uses today, and **keep the 2s polling path as an explicit fallback**:
   on `EventSource.onerror`/no-bus (`subscriberCount`/feature-detect →
   `PRECONDITION_FAILED` style), fall back to the existing poll loop. The
   pause toggle and `newHashes` highlight semantics are preserved.

**Ordering, backpressure, reconnect, subscriberCount:**

- **Ordering.** Within one bus instance subscribers see emit order (bus
  contract). The SSE `id:` is a monotonic per-connection sequence so the
  client can detect gaps; on reconnect the browser sends `Last-Event-ID`
  and the server resumes from the durable store (not the lossy bus) for the
  short backfill window, then re-attaches to the bus. This makes reconnect
  *gap-aware* without making the bus durable.
- **Backpressure.** SSE is per-connection; the server keeps a small
  bounded outbound buffer per subscriber and drops oldest on overflow
  (the bus is lossy by contract — dropping is acceptable for live
  observation). A slow client never blocks the bus or the durable write.
- **Reconnect.** `EventSource` auto-reconnects; the client treats a
  reconnect as "switch to polling until the stream re-establishes" so the
  operator never sees a frozen pane.
- **subscriberCount.** Exposed on a health probe (operator-only) and used
  by the client's feature-detect: zero subscribers / no bus ⇒ fall back to
  polling. Also a metric (§ below).

**Approvals & emergency:** `useApprovals` (2s) and `useEmergencyState`
(5s) can later migrate onto the same bus by publishing approval/emergency
*change events*, but those are **out of scope here** — emergency
deliberately polls because kill-switch state crosses replicas, and the
SSE/bus path does not change that correctness requirement. Document them as
fast-followers, not v1.

## 2.3 Determinism / security implications

- **Determinism:** unchanged. The bus is best-effort fan-out *outside* the
  determinism boundary; durable sinks and replay are untouched (bus
  contract: "The kernel never reads the bus … Audit-record hash + ledger
  semantics are unchanged"). Drift fed by the live bus is count-windowed
  and deterministic over the observed sequence (see `behavioral-drift.md`
  §Determinism); best-effort loss can cause replicas to diverge on
  *telemetry*, which is acceptable.
- **No wall-clock on a deterministic path.** SSE `id:`/timestamps are
  harness/adopter-supplied at the transport layer, never inside
  `adjudicate()`.
- **Security:** the SSE endpoint is an **operator** route — same
  fail-closed bearer + actor auth as `adminRouter`; it streams the same
  already-redacted record shape the console renders today. The **public
  web app gets no live stream** — public surfaces are coarse, cached
  aggregates only (§1). An attacker cannot use the public site to confirm
  "my injected intent landed" in real time.

## 2.4 Release impact

- **The bus producer is already published** (`@adjudicate/audit`
  `createInMemoryAuditEventBus` / `createRedisAuditEventBus` /
  `bridgeAuditSinkToBus` / `AuditEventBus` / `subscriberCount`). Wiring it
  is **app-only** — no new package surface, **no changeset/ADR/matrix
  row** for the SSE route or the `useLiveTail` rewrite.
- **Verify the bus symbols carry a freeze-matrix row.** If
  `@adjudicate/audit`'s event-bus exports are not yet in the matrix
  (`packages/audit` postdates parts of the 2026-05-20 snapshot), add
  retroactive rows in the same WS3 PR — tier `F`/`E`, owner `audit`,
  replay impact `none`, extension `additive`. No new *symbol* is being
  added, so no new changeset is required for the bus itself.
- One sentence in the consolidated WS3 ADR records "live-tail transport =
  SSE; bus best-effort; durable sink unchanged."

---

# 3 · Accessibility system

## 3.1 Current state (cited)

Ad-hoc aria with real gaps:

- **Charts are `aria-hidden` / image-only with no text alternative.** The
  operational drift `Sparkline` (`apps/console/.../dashboard/DriftPanel.tsx`)
  is `aria-hidden` with no fallback (per `behavioral-drift.md` §UI). The
  homepage `GuardMetadataGraph` SVG has `role="img"` +
  `aria-label="Guard metadata force graph"` (good) but the per-node detail
  is **hover/mouse-only** (`onMouseEnter`/`onMouseLeave`, lines 220–222) —
  no keyboard path. `OutcomeChart` is a hand-rolled SVG with no text
  alternative.
- **Tables lack `<caption>` / `<th scope>`.** The audit table
  (`src/components/table/*`) and several panels render data grids without
  scoped headers or captions.
- **No `aria-live` for polling updates.** New rows arrive via
  `useLiveTail` with a 1.5s visual highlight but nothing is announced to
  screen readers.
- **No skip-link**, **dialog focus management unverified** (replay dialog
  `src/components/replay/ReplayDialog.tsx`).

## 3.2 Proposed design — an a11y baseline + an axe gate

A small, shared, app-level baseline (no new published package):

1. **Skip-link + landmarks.** Add a "skip to main content" link in
   `ConsoleShell` (and the web layout); the existing `<main
   className="overflow-auto">` (`ConsoleShell.tsx` line 14) becomes the
   skip target with `id="main"`. Ensure one `<nav>` (sidebar), one
   `<main>`, one `<header>` (TopBar).
2. **Tables.** A shared table convention: every data grid gets a
   `<caption>` (visually-hidden allowed) and `<th scope="col|row">`.
   Codify in the shared table primitive (§5) so it's enforced by
   construction, not per-panel discipline.
3. **Charts get a text alternative — always.** Every chart component
   renders a visually-hidden `<table>` (or `<figcaption>` summary) as the
   accessible equivalent of the SVG, and the SVG itself is `role="img"`
   with an `aria-label` that summarises the headline number (e.g. "TVD
   0.31, above 0.25 threshold"). This is the standing rule for the
   charting primitive in §5 — it kills the "`aria-hidden` chart with no
   alternative" class of defect.
4. **Keyboard parity for interactive SVG.** Hover-only nodes
   (`GuardMetadataGraph`) gain `tabindex`, `role="button"`, and
   key handlers so selection works without a mouse; the detail aside
   reflects keyboard focus, not just `onMouseEnter`.
5. **`aria-live` for live updates.** The live-tail "N new records" status
   becomes an `aria-live="polite"` region; emergency-state changes are
   `aria-live="assertive"` (kill-switch is safety-critical). Respect
   `prefers-reduced-motion` for the row-highlight fade and any animated
   count-ups.
6. **Dialogs.** Standard focus-trap + restore + `Escape`-to-close +
   `aria-modal` on `ReplayDialog` (and any future modal), verified by
   test.

**The gate: `axe-core` in the component test run.** Add
`jest-axe`/`@axe-core/react` assertions to the RTL suites (console already
has jsdom + RTL — `@testing-library/react`, `jsdom` in
`apps/console/package.json` devDeps; web gets them in §6). Each major
section's test renders the component and asserts `expect(await
axe(container)).toHaveNoViolations()`. Wire it into `pnpm test` so it runs
in `ci.yml`'s existing **Test** step (no new CI job). A Playwright
`@axe-core/playwright` scan on the rendered pages becomes the E2E-level
gate (§6).

## 3.3 Determinism / security implications

None — a11y is presentation-layer. The one security-adjacent note: chart
text alternatives must obey the same redaction rules as the chart (the
public web chart's `<table>` fallback must also be aggregates-only).

## 3.4 Release impact

**App-only.** No published-package surface, no changeset/ADR/matrix row.
Adds `jest-axe`/`@axe-core/*` as **devDependencies** of the two apps. The
axe gate runs inside the existing `pnpm test` (ci.yml) — no workflow edit
required for the unit-level gate.

---

# 4 · Responsive system

## 4.1 Current state (cited)

Fixed desktop grid. `ConsoleShell.tsx` is `grid h-screen
grid-rows-[auto_auto_1fr]` wrapping `grid grid-cols-[220px_1fr]` (lines
9–15) — a hard 220px sidebar + content, `h-screen`, with essentially no
breakpoints (~3 responsive utility classes across the console; the web app
has `md:` classes in marketing sections like `GuardMetadataGraph`
`md:grid-cols-[2fr_1fr]`). Tables and the hand-rolled SVG charts use fixed
pixel widths (`OutcomeChart` defaults `width = 720`; `GuardMetadataGraph`
`width = 540`).

## 4.2 Proposed design

**Breakpoint scale** (reuse Tailwind defaults already in both apps —
`tailwindcss` is a devDep in both): `sm 640 / md 768 / lg 1024 / xl 1280`.
Console design targets: phone (`< md`), tablet (`md–lg`), desktop (`≥ lg`).

1. **Collapsible sidebar.** Replace the fixed `grid-cols-[220px_1fr]` with
   a responsive grid: `< md` → sidebar collapses to an off-canvas drawer
   toggled from `TopBar` (hamburger), content full-width; `md–lg` → icon
   rail (narrow); `≥ lg` → today's 220px expanded rail. Persist the
   collapsed/expanded preference (localStorage, app-only). Drawer is
   focus-trapped and `Escape`-closable (ties to §3 dialogs).
2. **Responsive tables.** At `< md`, data tables reflow to stacked
   "label-over-value" card rows (the pattern `behavioral-drift.md` already
   specifies for its Drift section). Horizontal scroll with a sticky first
   column is the fallback for wide audit tables. Codified in the shared
   table primitive (§5).
3. **Responsive charts.** Charts move off fixed pixel `width`/`height` to
   a `viewBox` + `width="100%"` (the `GuardMetadataGraph` SVG already uses
   `viewBox` + `className="w-full"` — generalise this). The chart
   primitive (§5) takes a container-measured width (`ResizeObserver` or a
   CSS-driven `viewBox`) so timelines/distributions scale; at `< md`
   long timelines collapse to a "latest-N" sparkline with a "view full"
   disclosure (per `behavioral-drift.md` §Responsive).
4. **`h-screen` → `min-h-dvh`/`100dvh`** so mobile browser chrome doesn't
   clip the layout.

## 4.3 Determinism / security implications

None — layout only. Responsive collapse must not hide the public web
app's redaction boundary (no "expanded" view reveals more data than the
collapsed one; both render the same allowlisted aggregates).

## 4.4 Release impact

**App-only.** No published surface, no changeset/ADR/matrix row.

---

# 5 · Shared UI primitives + charting

## 5.1 Current state (cited)

- **No shared loading/empty/error primitives.** Each panel hand-rolls its
  states: `OutcomeChart` returns its own "No decisions in the selected
  window." empty block; `GuardMetadataGraph` hand-rolls "Loading policy
  descriptors…" / "No named guards…"; hooks like `useBehavioralDrift`
  special-case `PRECONDITION_FAILED` → empty. Consistency is by
  convention, not by component.
- **Charts are bespoke zero-dep SVG.** `OutcomeChart`
  (`apps/console/.../dashboard/OutcomeChart.tsx`) is a hand-rolled stacked
  area chart — JSDoc: "Hand-rolled SVG — matches the console's
  monospace/data-density aesthetic and keeps the bundle free of a charting
  library." `GuardMetadataGraph` is a deterministic radial SVG — JSDoc:
  "'Force-ish' rather than full d3-force … keeps the bundle ~zero-dep …
  renders identically every page load." `DriftPanel` has its own
  `Sparkline`. **No charting library is installed in either app.**

## 5.2 Proposed design — shared primitives

A small **app-level** UI primitives module per app (or a shared
`packages/ui-kit` ONLY if reuse across both apps justifies it — default to
app-local to avoid new published surface; see §5.4):

- **`<Skeleton>`** — shimmer placeholders sized to the eventual content
  (table rows, chart canvas, badge). Respects `prefers-reduced-motion`.
- **`<EmptyState>`** — neutral, non-error styling with an icon + headline +
  optional hint. Distinguishes *healthy-empty* ("No active drift —
  distributions within threshold") from *not-configured*
  (`PRECONDITION_FAILED` copy, operator-only) from *zero-data*.
- **`<ErrorBoundary>` + `<Retry>`** — a React error boundary that catches
  render-time throws and a query-error fallback with a retry button that
  re-runs the tRPC query. On the **public web app**, the error fallback is
  the **fail-safe neutral** variant (no stack trace, no internal copy —
  ties to §1.5).

Every section adopts these so loading/empty/error are uniform across all
eight surfaces. This is the single biggest consistency win and unblocks
the per-surface docs, which all reference "loading: skeleton / empty: … /
error: …" states.

## 5.3 Charting recommendation

**Recommendation: keep bespoke zero-dep SVG, but consolidate it into a
small shared chart primitive set — do NOT add a charting library.**

Weighed against a lib (Recharts/visx/Chart.js):

| Criterion | Bespoke SVG (chosen) | Charting lib |
|---|---|---|
| **Bundle size** | ~0 KB added; both apps ship no chart dep today | +40–150 KB (Recharts pulls d3 modules); the gateway client is deliberately kept lean (`gateway/client.ts` JSDoc: keep `node:crypto` out of the browser bundle — same lean-bundle ethos) |
| **a11y** | we fully control the `<table>` text-alternative + `role="img"` (the §3 rule); libs vary and often emit `aria-hidden` SVGs | inconsistent, often needs the same hand-rolled fallback anyway |
| **Determinism of rendering** | a deterministic radial/area layout "renders identically every page load" (GuardMetadataGraph JSDoc) — matters for snapshot tests + the public static-rendered web view | many libs animate / measure on mount → non-deterministic snapshots |
| **Public web view** | same component can `force-static` render server-side into the public route | client-only libs complicate SSG |
| **Aesthetic fit** | matches the monospace/data-density console look the existing charts target | restyling a lib to match is its own cost |

So the platform ships a tiny chart kit — **`<Timeline>`** (line/area over
time, e.g. drift TVD, token burn-down), **`<Distribution>`** (bars, e.g.
decision-outcome / guard-fire), **`<Sparkline>`** (compact trend, reused
from `DriftPanel`), **`<BurnDown>`** (token budget) — all built on the
existing `OutcomeChart`/`GuardMetadataGraph`/`Sparkline` patterns, all with
the §3 text-alternative baked in, all `viewBox`-responsive (§4). One
reusable axis/scale helper replaces the per-chart math.

## 5.4 Determinism / security implications

- **Determinism:** the chart primitives must be **pure functions of their
  props** — no `Date.now()`, no `Math.random()` for jitter/layout (the
  radial layout is already deterministic). This keeps snapshot tests
  stable and the public `force-static` render reproducible build-to-build.
- **Security:** `<EmptyState>`/`<ErrorBoundary>` on web must never render
  internal error text; the chart text-alternative inherits the chart's
  redaction (aggregates-only on web).

## 5.5 Release impact

- **Default: app-only.** Primitives live in each app (or duplicated) — no
  published-package surface, no changeset/ADR/matrix row.
- **IF** a shared `packages/ui-kit` (or `@adjudicate/ui`) is created to
  avoid duplication across console+web, that IS a **new published package**
  and triggers the full governance rule: a `V1_FREEZE_MATRIX.md` section +
  an ADR + a changeset in the same PR, starting at **0.2.0** to ride the
  WS3 wave. **Recommendation: stay app-local for v1** (duplication of a
  handful of presentational components is cheaper than a new public
  contract on the frozen line). Flag the shared-package option as an open
  question, not a v1 commitment.

---

# 6 · Test & E2E harness

## 6.1 Current state (cited)

- **`apps/console`** has component testing: `@testing-library/react
  ^16.1.0`, `@testing-library/dom`, `@vitejs/plugin-react`, `jsdom
  ^25.0.1`, `@vitest/coverage-v8` in devDeps; ~16 component tests
  (`*.test.tsx` across `components/`).
- **`apps/web`** is **node-only vitest** — its `package.json` has
  `vitest` but **no `jsdom`, no `@testing-library/react`, no plugin-react**;
  it has **1 test** (`src/lib/kernel-runner.test.ts`, a node-side kernel
  runner). It cannot render/test React components today.
- **Neither app has E2E.** No Playwright anywhere. CI (`ci.yml`) runs
  `build → lint (tsc) → test (pnpm test) → check:versions →
  check:freeze-matrix (advisory) → audit`. `release-candidate.yml` runs the
  invariant pipeline (cross-runtime hash vectors, pack-trust, replay
  integrity, scale harness) but no app E2E.

## 6.2 Proposed design

**(a) Bring `apps/web` to component-test parity.** Add
`@testing-library/react`, `@testing-library/dom`, `jsdom`,
`@vitejs/plugin-react` (and `jest-axe`/`@axe-core/react` for §3) to
`apps/web` devDeps; add a `vitest.config` with `environment: "jsdom"` and
the react plugin (mirror the console's config). This is required to test
the new public dashboard components/badges and to run the §1 **redaction
snapshot test** (assert each `/api/public/*` payload contains ONLY
allowlisted fields — fails if PII/commands/prompts/tokens/raw-counts/
category-strings ever appear).

**(b) Playwright E2E (new, both apps).** Add a root `playwright.config.ts`
(or per-app) with two projects:

- **console E2E** — boots the console (`next dev`/`next start` on 5180)
  with a seeded mock context and `ADMIN_API_TOKEN` set, then drives the
  load-bearing operator flows:
  1. Audit Explorer + **live-tail** (assert new rows arrive via the SSE
     subscription; assert polling fallback engages when the stream is
     killed — §2).
  2. Each of the 8 governance sections renders Active/Dimensions/Timeline
     (or equivalent) with real loading→data transitions.
  3. A **mutation** flow behind auth (e.g. approval resolve or emergency
     toggle) — proves the bearer + actor path end-to-end.
  4. **`@axe-core/playwright`** scan on each page (the page-level a11y
     gate, §3).
- **web E2E** — boots the public site (5181) and asserts the **negative
  security properties**: the public dashboard renders the sanitized
  aggregates, and the page makes **no request to `/api/admin/trpc`**,
  carries **no token**, and exposes **no mutation control** (§1). Plus an
  axe scan of the public pages.

**(c) CI mapping.**

- **`ci.yml`:** the new `apps/web` jsdom/RTL tests + the axe unit gate run
  inside the existing **Test** step (`pnpm test`) with zero workflow edits
  (they're just more vitest tests). **Add one new job** `e2e` (Playwright):
  install browsers (`pnpm exec playwright install --with-deps chromium`),
  build, start both apps, run `playwright test`; upload the HTML report +
  traces as artifacts. Gate it on PRs to keep the operator flows honest.
- **`release-candidate.yml`:** add a Playwright run against a production
  `next build`/`next start` of both apps as an RC gate (mirrors how the RC
  pipeline runs scale/replay invariants today), uploading the report
  artifact alongside the existing `V1_FREEZE_MATRIX.md` / scale-baselines
  uploads. The **redaction snapshot test** must be in the RC gate's
  `pnpm test` so a public-leak regression blocks the release wave.

## 6.3 Determinism / security implications

- **Determinism:** E2E seeds deterministic mock contexts (the console
  already warms from `ALL_MOCKS`); chart snapshot tests rely on the §5.4
  pure-render guarantee. No wall-clock/RNG in test fixtures that feed the
  kernel.
- **Security:** the web E2E *is* a security test — it asserts the public
  app cannot reach `adminRouter` and leaks no privileged surface. The
  redaction snapshot test is the unit-level twin of that assertion. Both
  are first-class gates, not nice-to-haves.

## 6.4 Release impact

**App-only + CI.** New **devDependencies** (`@playwright/test`,
`@testing-library/react`/`jsdom`/`@vitejs/plugin-react` for web,
`jest-axe`/`@axe-core/*`) and CI workflow edits (`ci.yml` new `e2e` job;
`release-candidate.yml` new Playwright + redaction gate). **No
published-package surface, no changeset/ADR/matrix row** — these are
repo-infrastructure changes.

---

# 7 · Consolidated release & governance impact

**The cross-cutting platform work is overwhelmingly app-only.** It adds
**no new published-package symbols on its own** — with two conditional
exceptions, both recommended *against* for v1:

| Concern | New published surface? | Changeset / ADR / freeze-matrix row? |
|---|---|---|
| 1 · Dual-app data contract | No (public routes are app code in `apps/web`) | No package surface. One short ADR records the option-C decision (see below). |
| 2 · Real-time tail (SSE) | No (bus already published; SSE route + hook are app code) | No new symbol. Verify/backfill `@adjudicate/audit` event-bus matrix rows in the WS3 PR. |
| 3 · Accessibility | No | No (devDeps only: `jest-axe`/`@axe-core/*`). |
| 4 · Responsive | No | No. |
| 5 · UI primitives + charting | No, **if app-local** (recommended). **Yes** if a `@adjudicate/ui` package is extracted. | App-local → none. Shared package → full rule: matrix §, ADR, changeset, 0.2.0. |
| 6 · Test/E2E harness | No | No (devDeps + CI edits only). |

**ADR for this doc:** one consolidated ADR — **ADR-128 "Cross-cutting web
parity platform"** (next free number; highest existing is ADR-127,
confirmed). It records: (a) public web consumes data via app-local
allowlisted Next routes, not `adminRouter` (option C); (b) live-tail
transport = SSE with polling fallback, bus best-effort, durable sink
unchanged; (c) charting stays bespoke zero-dep SVG; (d) a11y + redaction
test gates. It confirms **no closed enum widens, wire format unchanged,
determinism boundary intact** — satisfying the governance rule
(EXTENSION_POLICY §2.2/§2.3; SEMVER_GOVERNANCE §5/§9) without adding a
published symbol.

**Sequencing:** all of the above ships in the **same combined post-v1
MINOR wave** as the per-surface WS3 work, alongside the existing 15 staged
changesets. The new packs (`@adjudicate/drift`, and the two new packs from
the WS3 wave) go stable at **0.2.0**. No major bump anywhere.

---

# 8 · Dependency note — which surfaces depend on which cross-cutting piece

```
                         ┌─────────────────────────────┐
                         │ 1 Dual-app data contract     │ ◀── ALL 8 surfaces (defines the
                         │   (public allowlist routes)  │      public/operator split + redaction)
                         └─────────────────────────────┘
 2 Real-time tail (SSE/bus) ─── Audit/Live-Tail (the tail itself)
                            └── Behavioral Drift  (detector.attach(bus) = the live feed)
                            (fast-follow: Approvals, Emergency)

 3 Accessibility   ─── ALL 8 (charts text-alt, tables scope, aria-live, dialog focus)
 4 Responsive      ─── ALL 8 (sidebar collapse, responsive tables/charts)
 5 UI primitives   ─── ALL 8 (Skeleton/EmptyState/ErrorBoundary loading/empty/error)
   └ charting kit  ─── Behavioral Drift (timeline), Red-Team (trend), Token-Budget
                       (burn-down), AI-BOM / Outcome (distribution), Command-Risk (trend)
 6 Test/E2E        ─── ALL 8 (RTL component states + Playwright flows);
                       web RTL + redaction test specifically gate the §1 public surfaces
```

- **Behavioral Drift** is the surface most coupled to the platform: it
  needs **§2** (the live bus is its real data feed, replacing the
  `ALL_MOCKS` warm-up), **§5** (timeline chart), **§3** (the
  `aria-hidden` sparkline fix), and **§1** (its sanitized public "drift
  status" badge). See `behavioral-drift.md`.
- **Audit / Live-Tail** depends on **§2** (SSE replaces the 2s poll) and
  **§3** (`aria-live` for arriving rows, table scope).
- **Every chart-bearing surface** (Drift, Red-Team, Token-Budget, AI-BOM,
  Command-Risk, Outcome) depends on **§5**'s chart kit + **§4**'s
  responsive `viewBox` + **§3**'s text-alternative rule.
- **Every public web view** of any surface depends on **§1**'s allowlist
  contract and **§6**'s redaction snapshot test.

---

## Effort

**L overall.** Each individual piece is S–M (the bus producer, drift
consumer, charts, and RTL toolchain already exist or have clear
precedents), but the work spans both apps, all eight surfaces, two CI
workflows, and a new Playwright harness — and it is the load-bearing
foundation the per-surface docs assume, so it should land first.
