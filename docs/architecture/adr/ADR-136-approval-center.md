# ADR-136 — Approval Center (persisted registry + decision history + audit chain)

- **Status:** Accepted
- **Date:** 2026-06-07
- **Scope:** `@adjudicate/approval-engine` (`createRedisApprovalRegistry` + `CreateRedisApprovalRegistryOptions` + `ApprovalRedisClient` — Redis-backed `ApprovalRegistry`), `@adjudicate/admin-sdk` (`approval.history` + `approval.chain` queries; `ApprovalHistoryQuery`/`ApprovalHistoryEntry`/`ApprovalHistoryResult` + `ApprovalChainQuery`/`ApprovalChainStepKind`/`ApprovalChainStep`/`ApprovalChainResult` schemas; optional `AdminContext.approvalPort.history`/`.chain`), apps/console (persisted registry selection, Decision history + Audit chain views, seeded resumed-decision mock). No web surface.
- **Related:** ADR-122 (`@adjudicate/approval-engine` — the engine, in-memory registry, and the display-only console resolve this extends), ADR-128 (web-parity platform — the public-redaction posture this view inherits: the Approval Center is operator-only and is never published). Design doc: `docs/roadmap/design/approval-center.md`.

## Context

ADR-122 shipped the approval engine: a display-projection `ApprovalRegistry` (in-memory only), pluggable channels, and `createApprovalEngine.resolve()` which routes a human approve/decline through adapter-core's `agent.confirm()` (single-use `confirmationStore.take()`, timing-safe parked-blob hash verify, kernel re-adjudication, parked-intent RESUME). The reference console, however, runs **no live adapter agent**, so its `approvalPort.resolve()` only calls `markResolved` — a display-only projection flip behind an explicit amber banner.

The Approval Center asks for three additive operator capabilities the engine did not yet expose: **restart-durable** projections (so the queue and history survive a cold start), a **decision history** view, and an **audit chain** linking a request to its resolution and the resumed decision. This ADR delivers those as SAFE, read-mostly additions — without faking an authorization path the reference console cannot honestly perform.

## Decision

Three additive pieces, plus an explicitly honest console resolve.

1. **`@adjudicate/approval-engine` (MINOR) — `createRedisApprovalRegistry`.** A Redis-backed `ApprovalRegistry` implementing the SAME `put`/`get`/`list`/`markResolved` interface as `createInMemoryApprovalRegistry`. The adopter injects a minimal `ApprovalRedisClient` (`set(k,v,exSeconds)`/`get`/`del`/`keys(pattern)`) — the package does NOT hard-depend on a concrete client. Each projection is JSON under `${keyPrefix}:req:${token}` (default prefix `adjudicate:approval`, default TTL 24h to match the ConfirmationStore). `list()` enumerates via a prefix-scoped `keys` (SCAN-backed in production clients).

2. **`@adjudicate/admin-sdk` (MINOR) — `approval.history` + `approval.chain` (queries, read-only, actor-gated).**
   - `approval.history({ sessionId?, status?, limit? }) → { entries }` — resolved/expired approvals from the registry projection. Each entry carries `token`/`sessionId`/`intentHash`/`intentKind`/`status`/`requestedAt`/`resolvedAt`/`resolvedBy`.
   - `approval.chain({ intentHash }) → { steps }` — joins the resolved projection to the resumed-decision `AuditRecord` and walks the FROZEN `AuditRecord.supersedes` lineage to emit ordered steps (`requested` → `resolved` → `resumed`). `ApprovalChainStepKind` is a NEW closed 3-value enum; `supersedesReason` reuses the frozen core `SupersessionReasonSchema` (`confirmation_resolved` / `defer_resumed`), never widened. Steps carry `tokenPresent` (presence ONLY — never the token value).
   - Both extend the existing optional `AdminContext.approvalPort` with optional `history`/`chain` members — `PRECONDITION_FAILED` when absent (the same runtime feature-detection posture as `driftDetector`). `list`/`resolve` are unchanged.

3. **apps/console (app-only) — persisted registry + the two new views, HONEST resolve.** The registry is in-memory by default and `createRedisApprovalRegistry` when `REDIS_URL` is set (mirrors how the emergency state store picks its backend). The console seeds a pending demo approval, a resolved demo approval, and a matching `confirmation_resolved`-supersession `AuditRecord` in `ALL_MOCKS` so history and chain render against honest data. `resolve()` stays display-only (`markResolved`), with the amber banner retained. New `ApprovalHistoryView` + `ApprovalChainView` deep-link each ledger-backed step to Decision Detail.

## Why this shape

- **Read-only join over the FROZEN supersession lineage.** `approval.chain` reconstructs request → resolved → resumed by reading the resumed decision's `AuditRecord` (via `ctx.store.getByIntentHash`) and following its existing `supersedes` back-link. No new audit shape, no new lineage taxonomy — the chain is a *projection* of links the kernel already writes (`confirmation_resolved` on the confirm step, `defer_resumed` on the park-resume step). It cannot perturb any decision; it only reads.
- **Registry is a lossy DISPLAY projection — never the envelope blob.** Both registries persist only the `ApprovalRequest` display fields. The authoritative parked envelope blob stays in adapter-core's single-use `ConfirmationStore`. Redis durability does not change replay determinism: confirmation tokens are not adjudication inputs.
- **Honest resolve over fake authorization.** The reference console runs no adapter agent, so it cannot redeem a single-use token, verify a parked-blob hash, re-adjudicate, or resume an intent. Rather than ship code that *looks* like authorization, `resolve()` records the operator decision into the persisted registry and nothing else — the banner says so. The real path is `createApprovalEngine.resolve()` → `agent.confirm()`, exercised by the approval-engine + adapter-core tests.

## Security analysis

- **Redis registry — residual TOCTOU (documented, accepted).** `markResolved` is a guarded read-modify-write: GET the projection, verify it is still `pending`, then SET the resolved shape. The status guard makes a re-resolve **idempotent** (a second call returns the existing resolution with no second SET). GET+SET is not a single atomic op, so two concurrent resolves on the same still-`pending` token can both pass the guard before either SETs — a last-write-wins race on `resolvedBy`/`resolvedAt`. This is a **display-projection race only**: the registry does not gate authorization, so the worst case is a cosmetic who/when mismatch, never a double-authorization. The real single-use guarantee is enforced upstream by `ConfirmationStore.take()` (get-and-delete) inside `agent.confirm()`, whose second call fails closed. Adopters wanting the projection mutation itself strictly atomic should wire a Lua `EVAL` (compare-and-set on status); tracked as a follow-up.
- **`resolvedBy` / chain `actor` is a CLAIM, not a proof (RBAC gap — flagged loudly).** The actor is read from the **forgeable** `x-adjudicate-actor-*` headers. The shared `ADMIN_API_TOKEN` bearer authenticates *the console*, not *the human operator* — anyone with the shared token can set any `id`/`displayName`. So `resolvedBy` and the chain's `actor` are **attestations, not evidence**. The history schema field comment, and the console UI ("claimed" labeling + hover title), make this explicit. **Recommendation:** wire real per-operator identity (`withClerkAuth` / `withOidcAuth`) before either field is treated as evidentiary.
- **Token confidentiality.** Neither the history entry nor the chain step schema carries a token *value*; the chain surfaces `tokenPresent` (boolean) only. The console renders a labeled lock for presence and never the value. Prompts/intentKinds are rendered as text, never markup.
- **Operator-only — never published.** The Approval Center carries tokens (presence), intentHashes, prompts (which may embed a raw destructive command), sessionIds, and claimed operator identity. None may reach apps/web. Enforcement is structural: apps/web never imports `approvalPort` and holds no bearer token, so it cannot reach `approval.*`. Per the transparency landing, the Approval Center is operator-only; **no web view is added** in this wave.
- **Auth / bounds.** `approval.history`/`approval.chain` sit behind the same fail-closed `requireConsoleAdminAuth` bearer gate and require an actor (consistent with `approval.list`). `limit` is schema-capped (≤500); the chain length is bounded (request → resolved → resumed).

## verifyParkedHash — strict flip is EVIDENCE-GATED and DEFERRED

The design's runtime-resume `verifyParkedHash` default flip (`"warn"` → `"strict"`) is **NOT** part of this wave. It is evidence-gated (an adopter must confirm no v0.5-era legacy parked blobs) and contract-touching. The runtime default **remains `"warn"`** — no runtime change ships here. The flip is deferred to a later MINOR with its own migration note; this ADR does not change the runtime behavior, and `V1_FREEZE_MATRIX.md` §26 is unchanged.

## Determinism

The history/chain handlers and the registry mutation are reads/telemetry — they never feed a kernel input. State is never stored in the projection and never enters `intentHash`. The registry accepts an injectable clock (`nowIso`) so tests are deterministic. No kernel/adapter-core change; no closed-enum widening (`ApprovalStatus` 4, `SupersessionReason` 5 reused as-is); the new `ApprovalChainStepKind` is a fixed 3-value enum.

## Invariants preserved

- Additive only: `approval.list`/`resolve` unchanged; `history`/`chain` feature-detected via `PRECONDITION_FAILED`. The in-memory registry is untouched; the Redis registry is a new sibling on the same interface.
- No kernel change; runtime `verifyParkedHash` default unchanged. The reference console resolve stays a projection (honest, banner retained).

## Alternatives considered

- **Wire the real engine in the reference console.** Rejected for this wave — the reference console runs no adapter agent and seeds no live `ConfirmationStore`/`deferStore`; wiring `agent.confirm()` over synthetic state would be authorization theatre. Honest projection + the documented real path (engine tests) is the safer reference.
- **A new audit/lineage shape for the chain.** Rejected — the frozen `AuditRecord.supersedes` already encodes the request → resumed link; the chain is a read-only projection of it.

## Test coverage

`packages/approval-engine/tests/registry-redis.test.ts` (put/get/list/markResolved over a fake injected client, status + session filters, prefix isolation, never-persists-blob, idempotent re-resolve with no second SET). `packages/admin-sdk/tests/approval-history-chain-trpc.test.ts` (history lists resolved with claimed actor; chain walks a seeded `confirmation_resolved` supersession into request → resolved → resumed; token value never serialized; PRECONDITION_FAILED when `history`/`chain` unwired; UNAUTHORIZED with no actor; malformed intentHash rejected). `apps/console/src/components/approvals/ApprovalCenter.test.tsx` (history rows + claimed-actor labeling; chain 3-step lineage; token-presence lock without value; deep links; empty/loading/error states; honest banner retained).
