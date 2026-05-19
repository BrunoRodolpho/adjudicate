# Threat Model — `@adjudicate/*` framework

**Status:** Design baseline for v0.5+ enterprise adoption.
**Audience:** Adopters performing internal security reviews, framework
contributors proposing security-labeled changes, third-party assessors
preparing a SOC2 / ISO 27001 statement.
**Scope:** First-party packages under `@adjudicate/*`. The model is
package-level. Where the mitigation lives in adopter configuration the
threat is labeled **out-of-scope** in §9.

> This document is a *design* threat model, not an attestation. It
> records the threats the framework's architecture is built to resist
> and the ADRs that encode each mitigation. It does not certify any
> particular deployment is secure — that requires an adopter-side
> review (§9.1).

---

## 1. Methodology

We use STRIDE:

| Letter | Threat class | What the attacker tries |
|---|---|---|
| **S** | Spoofing | Assume the identity of another principal |
| **T** | Tampering | Modify data in transit or at rest undetected |
| **R** | Repudiation | Deny that an action was taken |
| **I** | Information disclosure | Read secrets, PII, governance payloads |
| **D** | Denial of service | Exhaust resources to halt adjudication |
| **E** | Elevation of privilege | Acquire authority never granted |

STRIDE is mechanical, not exhaustive — it forces enumeration in six
directions but does not surface threats that don't fit one of the
columns (e.g., supply-chain compromise of a transitive npm dependency,
out-of-scope in §9.3). Where a column for a package has no plausible
threat we say so explicitly rather than padding.

The framework's defense-in-depth posture predates this document.
ADR-101 (kernel-side audit emission), ADR-102 (fail-closed default),
ADR-103 (per-tenant kill switch), ADR-104 (envelope v2 nonce +
auth-after-taint reorder), ADR-105 (closed metadata vocabulary),
ADR-106 (guard exception isolation), ADR-111 (auditHash + policy/kernel
version), and ADR-112 (observability semantic conventions) encode most
mitigations enumerated here. The threat model's job is to make those
mitigations *addressable*: when a future change touches a package, the
reviewer checks whether any threat below loses its mitigation.

---

## 2. `@adjudicate/core` — the kernel

`adjudicate(envelope, state, policy) → Decision` is pure, sync,
deterministic, total. `adjudicateAndAudit(envelope, state, policy,
deps)` wraps it with ledger consult, metrics, audit emission. Both
live in `@adjudicate/core`.

**Spoofing**

- **S1 — Forged `IntentActor`.** Envelope claims a privileged role
  the caller does not own. *Mitigation:* the kernel does not
  authenticate actors; the adopter's auth boundary (capability
  planner, request middleware) sets `actor` from a validated
  session. The kernel propagates `actor` into `AuditRecord`, making
  any spoof durably attributable. Combined with ADR-103 per-tenant
  context, tenant A's envelopes cannot reach tenant B's runtime
  slots because the context is bound to the executor wiring.
- **S2 — Forged taint label.** Envelope arrives with
  `taint: "TRUSTED"` from an UNTRUSTED ingestion path. *Mitigation:*
  taint is stamped at the ingestion boundary (adapter, webhook
  handler), not derived from the envelope's claim. `canPropose()`
  enforces `Pack.taint.minimumFor(kind)`. ADR-104's auth-after-taint
  reorder short-circuits an UNTRUSTED forgery before any auth
  guard side effect.

**Tampering**

- **T1 — Replay of a stored envelope.** *Mitigation:* ADR-104 makes
  `nonce` required and hashes it into `intentHash`; ADR-101's
  `adjudicateAndAudit` consults the Execution Ledger and returns
  `REPLAY_SUPPRESSED REFUSE` on hash collision.
- **T2 — Hash collision against `intentHash`.** *Mitigation:*
  sha256 collision resistance (~2^128 work). Out of threat budget;
  ADR-104's recipe covers all caller-controlled identity.
- **T3 — Tampering with stored `AuditRecord`.** *Mitigation:*
  ADR-111's `auditHash` is sha256 over the canonical record;
  `verifyAuditRecord` detects byte-level tamper with
  derived-vs-stored mismatch. ADR-111's `signature` seam (v0.5)
  upgrades this from detection to non-repudiation.

**Repudiation**

- **R1 — "I never submitted that intent."** *Mitigation:* every
  call to `adjudicateAndAudit` produces exactly one `AuditRecord`
  (ADR-101 invariant) containing the envelope, decision, actor,
  taint, and intentHash. ADR-111's `auditHash` binds the contents
  to a value the emitter cannot retroactively change.
- **R2 — "Kernel decided X, but the system did Y."** *Mitigation:*
  the `intentHash` join key links the `AuditRecord` to the
  executor's side-effect log. Replay (ADR-104 `legacyV1ToV2` +
  ADR-110 conformance harness) re-runs the kernel and verifies the
  same Decision is produced — kernel purity makes this a
  high-assurance check.

**Information disclosure**

- **I1 — Secrets in audit basis details.** *Mitigation:* ADR-105's
  closed metadata vocabulary discourages free-string payload
  smuggling; `detail` is typed and expected to carry refusal
  context, not raw payload. Bounded by Pack-author discipline —
  see `docs/security/security-review-checklist.md`.
- **I2 — Leak via error messages.** A guard throws with a secret in
  the message; ADR-106's panic refusal preserves error message for
  operator debugging. *Mitigation:* same Pack-author discipline as
  I1; ADR-107's `localizeDecision` swaps user-facing strings at
  presentation time without rewriting the audit basis.

**Denial of service**

- **D1 — Adversarial guard-panic flood.** *Mitigation:* ADR-106
  converts throws to `SECURITY` REFUSE; try/catch overhead is
  microseconds; audit volume is bounded by adopter-side rate
  limiting. ADR-104's reorder ensures UNTRUSTED-rejected inputs do
  not run auth-side effects.
- **D2 — Resource limit exhaustion (ReDoS).** *Mitigation:* the
  kernel itself contains no regexes — it iterates guards and uses
  `===` / numeric compare. Adopter-authored guards may contain
  regexes; a future Tier 2 analyzer (AJD-2xx, ADR-109) lands
  ReDoS-pattern detection. Currently an adopter responsibility.

**Elevation of privilege**

- **E1 — `policy.default = "EXECUTE"` smuggling.** *Mitigation:*
  AJD-106 (ADR-109) warns on fail-open default; `--strict` mode
  promotes to error. ADR-102 documents fail-closed as load-bearing.
- **E2 — Taint downgrade.** *Mitigation:* `IntentEnvelope.taint`
  is read-only; the kernel provides no downgrade primitive. A
  REWRITE produces a new envelope with `taint` preserved.

---

## 3. `@adjudicate/runtime` — DEFER park/resume + kill switch

**Spoofing**

- **S3 — Forged signal name on resume.** *Mitigation:* signal
  source authentication is adopter-side (Stripe signature, NATS
  ACL). The parked intent's `intentHash` and original taint are
  preserved across park/resume; the resume re-runs the full guard
  chain.

**Tampering**

- **T4 — Replay of a resume signal.** *Mitigation:* `intentHash`
  preserved across park/resume (ADR-104 nonce carries through).
  Re-adjudication consults the ledger; second resume returns
  `REPLAY_SUPPRESSED REFUSE`.

**Repudiation**

- **R3 — Operator denies flipping the kill switch.** *Mitigation:*
  ADR-103's `setKillSwitch(true, reason)` propagates `reason` into
  metrics + learning sinks; the kill-switch REFUSE is recorded in
  `governance_events`. Adopters should add `actor: operator.id` at
  the call site for full attribution.

**Information disclosure**

- **I3 — Parked-intent state leak.** *Mitigation:* the parking
  store (Redis, Postgres) is adopter-managed; encryption-at-rest,
  ACLs, TTLs are the adopter's responsibility
  (`docs/compliance/soc2-mapping.md` CC6.1). `RuntimeContext.id`
  prevents cross-tenant leak within one process.

**Denial of service**

- **D3 — Park flood.** *Mitigation:* `deadlinePromise` bounds park
  lifetime; over-deadline intents produce `kernel_deadline_exceeded`
  refusals (ADR-107 names the code; ADR-106 isolates the throw).
  Capacity planning is adopter responsibility.
- **D4 — Distributed kill-switch poll failure flood.** *Mitigation:*
  ADR-102's `recordSinkFailure` fires with `errorClass:
  "distributed-kill-switch"`. Fail-closed default means poller
  outage refuses all traffic rather than allowing all traffic.

**Elevation of privilege**

- **E3 — Resume bypasses taint floor.** *Mitigation:* resume
  re-runs the full guard chain — taint gate before auth-side
  effects. The resume cannot upgrade effective taint without going
  through `canPropose()` as a fresh submission.

---

## 4. `@adjudicate/audit` + `@adjudicate/audit-postgres` — durability

**Spoofing**

- **S4 — Forged `AuditRecord` injected into Postgres.**
  *Mitigation:* ADR-111's `auditHash` alone does not prevent
  fabrication (forger can compute the hash). v0.5's `signature`
  field with a KMS-backed signer is the full mitigation; until
  then, partially mitigated (hash detects post-write tamper).

**Tampering**

- **T5 — `multiSink` silent failure.** *Mitigation:* ADR-102
  flipped `multiSink` to strict by default; failure propagates
  into the executor. Adopters who want fail-open opt in to
  `multiSinkLossy` explicitly.
- **T6 — `bufferedSink` overflow with eviction.** *Mitigation:*
  `persistentBufferedSink` (ADR-102) requires `onOverflow` and a
  `PersistentSpillStorage` backend; records survive process
  restart; recovery drains FIFO.
- **T7 — Postgres row UPDATE rewriting basis.** *Mitigation:*
  ADR-111's `auditHash` + `verifyAuditRecord` detects on read; the
  Postgres migration adds an index on `audit_hash`; a daily
  verification job can scan for mismatches.

**Repudiation**

- **R4 — "Audit had a sink failure but my intent executed."**
  *Mitigation:* ADR-102's fail-closed default + ADR-101's one-emit
  invariant means a sink failure propagates as an exception,
  preventing EXECUTE-while-audit-incomplete. Adopters who opt into
  `multiSinkLossy` accept this risk explicitly.

**Information disclosure**

- **I4 — Audit records expose PII to ops staff.** *Mitigation:*
  framework recommends row-level access control (e.g., a
  `governance_events_redacted` view masking payload fields).
  Partial adopter responsibility — framework provides
  ADR-111's `policyVersion` and `actor.tenant` columns; adopter
  applies the ACL.
- **I5 — Sink-failure events leak payload context.** *Mitigation:*
  `recordSinkFailure` carries `errorClass` and sink identity, not
  envelope payload. Payload lives in `AuditRecord` (controlled
  surface).

**Denial of service**

- **D5 — Postgres write amplification.** *Mitigation:* date
  partitioning (documented in `docs/ops/`); buffered sink absorbs
  bursts; ADR-111's added fields are ~10–50 bytes/row (negligible).
- **D6 — Spill storage exhaustion.** *Mitigation:* `onOverflow` is
  a required callback (ADR-102) — adopter must specify behavior
  (refuse-all, page-on-call, switch to lossy). Forced explicit.

**Elevation of privilege**

- **E4 — Audit credentials reused for non-audit access.**
  *Mitigation:* framework-recommended deployment uses a
  minimal-privilege role (`INSERT` + `SELECT` on
  `governance_events*` only). README documents the role DDL.
  Adopter-configurable.

---

## 5. `@adjudicate/anthropic` — LLM adapter

**Spoofing**

- **S5 — LLM tool-call forgery.** LLM emits an intent for a kind
  the user lacks. *Mitigation:* `CapabilityPlanner` filters
  visible tools by actor capability; unauthorized kinds are
  never surfaced to the LLM. Hallucinated kinds refuse with
  `unknown_intent_kind`.

**Tampering**

- **T8 — Prompt-injection rewrites the envelope.** Prose
  instructing the LLM to set `taint: "TRUSTED"`. *Mitigation:* the
  adapter sets taint, not the LLM. ADR-104 requires `nonce`; the
  adapter generates it via `crypto.randomUUID()`. LLM cannot
  control envelope identity.

**Repudiation**

- **R5 — LLM denies emitting a tool call.** *Mitigation:* the LLM
  is not a durable principal; `AuditRecord.actor` is the human
  user whose request the LLM was parsing. The LLM has zero
  identity in the audit trail.

**Information disclosure**

- **I6 — LLM context leak into envelope payload.** *Mitigation:*
  the `CapabilityPlanner`'s `READ_ONLY` / `MUTATING` partition
  (`docs/architecture/decisions.md §9`) — the LLM cannot call
  mutating tools, only emit envelopes. Leak surface bounded by
  the payload's declared schema.

**Denial of service**

- **D7 — LLM emits malformed envelopes in a loop.** *Mitigation:*
  adapter validates against envelope schema before
  `adjudicateAndAudit`; framework recommends per-actor LLM rate
  limits. Schema-rejected envelopes do not consume kernel
  resources.

**Elevation of privilege**

- **E5 — LLM emits a privileged kind.** *Mitigation:* adapter
  stamps `taint: UNTRUSTED` on LLM-originated envelopes. ADR-104
  taint gate refuses with `taint_level_insufficient` before any
  auth-side effect. LLM cannot lift its own authority.

---

## 6. `@adjudicate/admin-sdk` — operator API

**Spoofing**

- **S6 — Forged operator token.** *Mitigation:* the admin-sdk does
  not authenticate — host application's auth boundary
  (NextAuth, Auth0, OIDC) does. SDK provides typed schemas;
  spoofing detection lives at the auth boundary.

**Tampering**

- **T9 — Admin request modified in transit.** *Mitigation:* TLS 1.3
  at the host's reverse proxy; mTLS recommended for service-to-
  service (`docs/compliance/soc2-mapping.md` CC6.6).
- **T10 — Admin writes that bypass kernel audit.** *Mitigation:*
  the admin-sdk surface is *read* + *control* (kill switch,
  capability config) — not arbitrary writes. Control operations
  emit their own governance events.

**Repudiation**

- **R6 — Admin denies executing a replay.** *Mitigation:* replay
  emits `AuditRecord` rows with `supersession.kind: "replay"`
  lineage (ADR-111); trail records operator (when host wires
  `actor: operator.id`) and `policyVersion` + `kernelVersion`.

**Information disclosure**

- **I7 — Admin-sdk leaks tenant-scoped audit to wrong operator.**
  *Mitigation:* schemas accept a tenant filter; host enforces
  tenant scoping at auth layer. ADR-103 `RuntimeContext.id` and
  ADR-111 `policyVersion` provide join keys for scoped views.

**Denial of service**

- **D8 — Unbounded admin query.** *Mitigation:* Postgres
  partitioning + admin-sdk pagination defaults bound per-query
  cost. The surface forces pagination on list endpoints.

**Elevation of privilege**

- **E6 — Operator gains role beyond their authority.**
  *Mitigation:* admin-sdk does not encode RBAC — the host's auth
  boundary does. Adopter responsibility (§9.1).

---

## 7. `@adjudicate/analyze` — static analysis

**Spoofing**

- **S7 — Pack passes analyzers but fails at runtime.** Metadata
  lies about guard behavior (declares
  `mutatesPayloadFields: ["amount"]` but mutates `recipient`).
  *Mitigation:* ADR-109 acknowledges this Tier 1 limitation;
  Tier 2 (symbolic execution, v0.4+) walks guard AST to verify
  declarations match bodies. Until then, the runtime audit
  catches divergence (REWRITE basis includes actual mutated
  fields).

**Tampering**

- **T11 — SARIF output altered between CI and reviewer.**
  *Mitigation:* CI pipeline signs the SARIF (adopter
  responsibility — GitHub Actions, GitLab CI attestation
  primitives). Framework produces deterministic SARIF (ADR-109
  pipeline is pure).

**Repudiation**

- **R7 — Author denies running `--strict`.** *Mitigation:*
  analyzer is a CI gate (ADR-109 CI integration example); the
  pipeline's audit log records the run.

**Information disclosure**

- **I8 — Diagnostic message leaks Pack source.** *Mitigation:*
  diagnostics carry codes (AJD-101..AJD-106) + severity + a
  structured location, not free-text containing source. Closed
  vocabulary (ADR-109 mirrors ADR-105).

**Denial of service**

- **D9 — Analyzer exhaustion on huge Pack.** *Mitigation:* Tier 1
  is O(n) in guards; resource bounds are CI's responsibility.

**Elevation of privilege**

- **E7 — Analyzer rule silently disabled.** *Mitigation:* the
  closed catalog + pipeline architecture means disabling
  requires a config change visible in `analyze.config.ts`;
  `--strict` promotes warnings to errors, making suppression
  conspicuous.

---

## 8. Cross-cutting mitigations

**Replay determinism.** Kernel purity (ADR-101 defense of
`adjudicate()` as sync/total/pure) is load-bearing for T3, R2, T7.
ADR-104's `nonce` makes envelope identity stable; ADR-105's closed
vocabulary keeps guard descriptions stable; ADR-111's
`policyVersion` + `kernelVersion` let the replay reader resolve the
correct Pack and kernel at emit time.

**Defense-in-depth ordering.** The `state → taint → auth → business`
order (ADR-104 reorder) is itself a security property. A future ADR
proposing declarative phase metadata MUST preserve this as a
closed-enum invariant (`docs/concepts.md §9.5`).

**Observability as a security signal.** ADR-112's stable `SEMCONV`
attribute names mean dashboards and alert rules survive framework
upgrades. A spike in
`adjudicate.decision.kind = REFUSE` AND `basis.category = security`
is the operator's first signal of an active attack — the stable
names ensure the alert rule does not break across versions.

---

## 9. Out-of-scope threats

The threat model bounds what the *framework's architecture* mitigates.
The threats below are real, important, and require adopter-side or
ecosystem-side mitigations.

### 9.1 Adopter-side misconfiguration

- `policy.default = "EXECUTE"` deliberately set without `--strict`.
  AJD-106 warns; adopter may silence.
- `actor` set from unvalidated session — every Spoofing threat
  collapses. Framework documents the pattern; cannot enforce.
- `taint` defaulted to TRUSTED — adapter sets it, kernel trusts it.
- `multiSinkLossy` wired explicitly — adopter opts into fail-open.
- `onOverflow` handler that silently drops — adopter writes it.
- Postgres role with `UPDATE` / `DELETE` on `governance_events` —
  recommended role is `INSERT` + `SELECT` only; adopter may grant
  more.

### 9.2 Host compromise

Root or container escape bypasses every framework-internal
mitigation: attacker reads process memory, edits module state,
exfiltrates session tokens. Framework mitigations stop at the OS
boundary. Adopters mitigate via host hardening (SELinux, gVisor,
container scanning, secrets management).

### 9.3 Supply-chain attacks

- **Compromised npm dependency.** Bounded by pinned versions in
  `pnpm-lock.yaml`, `npm audit` in CI, and the framework's small
  dependency graph. Does not prevent the attack; bounds blast
  radius.
- **Typo-squatted registry name.** Mitigated by npm provenance
  attestation (v0.5+); until then, adopters verify the publisher.
- **Compromised dev environment.** Signed commits (recommended),
  code-owner review on `packages/core/**`, conformance + replay
  suites in CI, public ADR discipline.

### 9.4 Side-channel attacks

Timing attacks on basis-code comparison, cache-based attacks on
state lookup. Not in scope. Kernel is deterministic but not
constant-time; basis-code comparison uses string equality.
Adopters whose threat model includes side-channel attackers
should layer constant-time comparison at their own boundary.

### 9.5 Cryptographic-primitive failures

sha256 collision, RNG entropy starvation. Out of scope under
standard assumptions. `intentHash` and `auditHash` inherit the
runtime's `crypto.subtle` (or `node:crypto`) guarantees.

---

## 10. Mitigation matrix (summary)

| Threat | Primary ADR | Status |
|---|---|---|
| Replay (T1, T4) | ADR-104 nonce + ADR-101 ledger | Mitigated |
| Audit tamper (T3, T7) | ADR-111 auditHash | Mitigated (detect); v0.5 sign |
| Audit fabrication (S4) | ADR-111 signature seam | Partial; full at v0.5 |
| Sink silent loss (T5) | ADR-102 strict default | Mitigated |
| Buffer overflow loss (T6) | ADR-102 persistent spill | Mitigated |
| Cross-tenant kill (S1, E1) | ADR-103 RuntimeContext | Mitigated |
| Untrusted side effect (E5) | ADR-104 taint reorder | Mitigated |
| Guard panic (D1, I2) | ADR-106 isolation | Mitigated |
| Locale leak indirect | ADR-107 externalization | Mitigated |
| Fail-open Pack (E1) | ADR-109 AJD-106 | Mitigated (analyzer) |
| Pack drift at replay (R2) | ADR-111 policyVersion | Mitigated |
| Adopter misconfig (§9.1) | n/a — documented | Out-of-scope |
| Supply chain (§9.3) | n/a — ecosystem | Out-of-scope |

---

## 11. Maintenance

Updated alongside ADRs that add or modify mitigations.
`docs/security/security-review-checklist.md` requires every
security-labeled PR to confirm whether it introduces new threats or
invalidates existing mitigations.

Reviewed: 2026-05-18 (M4 — initial publication).
Next review: at every ADR landing under M5 enterprise hardening,
or per scheduled annual review.
