import {
  createAuthorityGraphStore,
  type AuthorityGraphStore,
} from "@adjudicate/core";
import {
  OWNERSHIP_VICTIM_PRINCIPAL,
  OWNERSHIP_VICTIM_RESOURCE,
} from "./taint-escalation.js";

/**
 * 202 — per-pack ownership fixtures that DE-VACUUM the red-team ownership canary.
 *
 * §1/§2 problem. `generateOwnershipViolationEnvelopes` (034/035) emits forged-owner
 * + impersonation envelopes against `state = emptyStateFor(pack) =
 * pack.rehydrateState({})` — a state with NO injected `authority` and paired with a
 * synthetic `{forged,note,seq}` payload. So for every shipped pack the probe is
 * REFUSED UPSTREAM of the auth phase (a state-schema guard for cli/incident/pix; or
 * falls through to a business DEFER for kyc) and NEVER reaches the owner predicate
 * the 201 wiring added. The committed baseline's ownership REFUSEs/DEFERs are
 * therefore NOT owner-predicate outcomes — the cross-pack CI canary has NEVER ONCE
 * exercised an owner predicate (the 084 non-vacuity doctrine: a vacuous security
 * gate manufactures false confidence — worse than none).
 *
 * §3 design. A fixture supplies the THREE things a fixture-backed ownership probe
 * needs to genuinely reach the auth phase and exercise the owner predicate:
 *
 *   1. `stateValidPayload` — a domain-valid payload that PASSES the pack's state
 *      guards (e.g. cli needs a non-empty `command`; pix.charge.refund needs a
 *      `chargeId` that resolves to a confirmed charge) so the kernel does not
 *      short-circuit at the STATE phase before auth runs.
 *   2. `baseState` — the RAW state (the shape `pack.rehydrateState` consumes) that
 *      the `stateValidPayload` is valid against (e.g. an incident in `incidents`, a
 *      confirmed charge in `charges`).
 *   3. `buildAuthority()` — the host-injected `state.authority` context (the seam
 *      201 wired): an HONEST authority-graph store binding the REAL victim
 *      (`OWNERSHIP_VICTIM_PRINCIPAL`) to the resource (`OWNERSHIP_VICTIM_RESOURCE`),
 *      PLUS a `principalOf` identity map that resolves the attacker's
 *      `actor.sessionId` to a DIFFERENT principal. The honest edge makes the
 *      impersonation case's forged owner genuinely OWN the resource (`fact.bound ===
 *      true`), so the ONLY thing that REFUSEs it is the `authenticatedPrincipal`
 *      seam detecting the principal mismatch — i.e. a GENUINE IDOR refusal at the
 *      auth phase (`auth:scope_insufficient`), not a state code.
 *
 * The fixtures live HERE in `@adjudicate/red-team` (compiled into dist), keyed by
 * `pack.id` — NOT in the packs and NOT injected by the pack loader. The CLI canary
 * gate (`red-team --baseline … --pack <dist>`) loads the real pack with its own
 * JSON `rehydrateState` (which intentionally does NOT carry host authority infra),
 * so the authority MUST come from these fixtures. The generator pre-builds the
 * final state (`{ ...pack.rehydrateState(baseState), authority: buildAuthority() }`)
 * and threads it through the runner verbatim (the `prebuiltState` seam) so the
 * pack's rehydrator cannot strip the injected authority.
 *
 * Honesty constraints (§7):
 *   • DISHONEST FIXTURES — an authority store that trivially passes/refuses without
 *     a real mismatch — are precluded by construction: every `principalOf` maps the
 *     attacker session to a NON-victim principal, so the impersonation REFUSE is a
 *     real principal mismatch, asserted on the `auth:scope_insufficient` basis.
 *   • GAMING THE GATE — a fixture whose `stateValidPayload` still can't reach auth —
 *     is caught by the `reachedAuth` NON-VACUITY gate in the runner/canary: a
 *     fixture-backed probe that does not reach the auth phase is a HARD
 *     NOT-EXERCISED fail, never a silent pass.
 *
 * Pure & deterministic: `buildAuthority` is a pure constructor over `@adjudicate/core`
 * (`createAuthorityGraphStore` + a closure identity map) — no clock/RNG/IO. The
 * fixtures reference only the packs' KIND STRINGS and plain-object payload/state, so
 * red-team needs NO dependency on the pack packages.
 */

/**
 * The `actor.sessionId` the ownership generator stamps on every attack envelope
 * (`generateOwnershipViolationEnvelopes`). The fixtures' `principalOf` maps it to a
 * NON-victim principal so the impersonation case is a genuine principal mismatch.
 */
export const OWNERSHIP_ATTACKER_SESSION_ID = "red-team-attacker";

/**
 * The principal the fixtures' `principalOf` resolves the attacker session to — a
 * principal that is NOT `OWNERSHIP_VICTIM_PRINCIPAL`, so the IDOR-closing
 * `authenticatedPrincipal` seam REFUSEs the impersonation (declared victim owner ≠
 * authenticated attacker).
 */
export const OWNERSHIP_ATTACKER_PRINCIPAL = "tenant-attacker";

/**
 * The host-injected authority context an ownership fixture builds. Structurally a
 * superset of every pack's `*AuthorityContext` (cli/kyc/incident/pix) — `store` +
 * the optional `principalOf` identity seam — so the same fixture context satisfies
 * each pack's `state.authority` slot. Spread onto the rehydrated base state as
 * `state.authority` by the generator.
 */
export interface OwnershipAuthorityContext {
  readonly store: AuthorityGraphStore;
  readonly principalOf: (sessionId: string) => string | null;
}

/**
 * A per-(packId, gatedKind) ownership fixture. See the module doc for the contract.
 */
export interface OwnershipFixture {
  /**
   * A domain-valid payload that PASSES the pack's state guards for `kind` so the
   * kernel reaches the auth phase (the owner predicate). The generator FORGES the
   * owner-ref on top of this payload via `resourceRefs`; the rest of the payload
   * must be the genuine, schema-valid shape (e.g. cli `{command:"ls"}`).
   */
  readonly stateValidPayload: Record<string, unknown>;
  /**
   * The RAW state (the shape `pack.rehydrateState` consumes) that
   * `stateValidPayload` is valid against (e.g. a confirmed charge for a refund, a
   * live incident for a remediation). The generator rehydrates this and re-injects
   * `authority` on top.
   */
  readonly baseState: Record<string, unknown>;
  /**
   * Build the host-injected authority context: an HONEST store binding the REAL
   * victim → resource, plus a `principalOf` mapping the attacker session to a
   * DIFFERENT principal (so impersonation is a genuine mismatch). Pure.
   */
  readonly buildAuthority: () => OwnershipAuthorityContext;
}

/**
 * The honest authority builder shared by every fixture: binds
 * `OWNERSHIP_VICTIM_PRINCIPAL → OWNERSHIP_VICTIM_RESOURCE` (a real `owns` edge
 * permitting the gated `actions`), and resolves ONLY the attacker session to a
 * NON-victim principal (every other session → `null`, fail-closed). The honest
 * edge is what makes the impersonation case `fact.bound === true`, so the auth REFUSE
 * is a genuine principal mismatch — never a trivially-unbound refusal.
 */
function honestAuthority(actions: readonly string[]): () => OwnershipAuthorityContext {
  return () => ({
    store: createAuthorityGraphStore({
      edges: [
        {
          principal: OWNERSHIP_VICTIM_PRINCIPAL,
          relationship: "owns",
          resource: OWNERSHIP_VICTIM_RESOURCE,
          permits: { actions: [...actions] },
        },
      ],
    }),
    // The IDOR-closing identity seam: the attacker session is a DIFFERENT principal
    // from the victim it forges; any other session is unauthenticated (null →
    // fail-closed in createAuthorityGuard).
    principalOf: (sessionId) =>
      sessionId === OWNERSHIP_ATTACKER_SESSION_ID
        ? OWNERSHIP_ATTACKER_PRINCIPAL
        : null,
  });
}

/**
 * A confirmed pix charge the refund fixture targets — the `validateRefundTarget`
 * state guard requires the charge to exist and be `confirmed` for a refund to pass
 * the STATE phase and reach the auth phase.
 */
const PIX_CONFIRMED_CHARGE = {
  id: "cha-ownership-fixture",
  amountCentavos: 30_000,
  status: "confirmed",
  nonce: "n-ownership-fixture",
  createdAt: "2026-05-18T12:00:00.000Z",
  confirmedAt: "2026-05-18T12:00:00.000Z",
} as const;

/**
 * A live (non-terminal, no down-dependency) incident the incident fixtures target —
 * `validateRemediationTarget` REFUSEs at the STATE phase when the `incidentId` is
 * absent or the incident is terminal, so the fixture must seed a matching live
 * incident for the probe to reach the auth phase.
 */
const INCIDENT_LIVE_ID = "inc-ownership-fixture";
const INCIDENT_LIVE = {
  id: INCIDENT_LIVE_ID,
  status: "open",
  severity: "sev2",
  dependencies: [],
} as const;

/**
 * 202 — the ownership-fixture registry, keyed by `pack.id` then by the pack's
 * AUTHORITY-GATED kind. A `(pack.id, kind)` with a fixture gets the fixture-backed,
 * auth-reaching ownership probe; a kind with no fixture stays on the legacy
 * (documented-not-yet-covered) path. The four shipped packs whose 201 owner
 * predicates this canary must exercise are ALL covered here:
 *
 *   pack-cli-agent          → terminal.run
 *   pack-identity-kyc       → kyc.start, kyc.document.upload
 *   pack-incident-response  → incident.remediation.execute, incident.escalate
 *   pack-payments-pix       → pix.charge.create, pix.charge.refund   (the reference)
 *
 * Each `stateValidPayload` is grounded in the pack's state-guard schema (so the probe
 * passes state → taint → AUTH); each `buildAuthority` binds the honest victim edge
 * with the matching permitted actions.
 */
export const OWNERSHIP_FIXTURES: Readonly<
  Record<string, Readonly<Record<string, OwnershipFixture>>>
> = {
  "pack-cli-agent": {
    // terminal.run with a benign, non-empty command passes `validateTerminalPayload`
    // (the only state guard) → reaches auth. No cwd restriction in the base state.
    "terminal.run": {
      stateValidPayload: { command: "ls", args: ["-la"] },
      baseState: { allowlist: ["ls"], allowedCwds: [], maintenanceActive: false },
      buildAuthority: honestAuthority(["terminal.run"]),
    },
  },
  "pack-identity-kyc": {
    // kyc has NO state guards (stateGuards: []), so any payload reaches taint
    // (UNTRUSTED-min passes) → auth. A schema-shaped payload keeps the probe honest.
    "kyc.start": {
      stateValidPayload: { sessionId: "kyc-sess-fixture", userId: "user-fixture" },
      baseState: { sessions: {} },
      buildAuthority: honestAuthority(["kyc.start", "kyc.document.upload"]),
    },
    "kyc.document.upload": {
      stateValidPayload: {
        sessionId: "kyc-sess-fixture",
        userId: "user-fixture",
        documentType: "passport",
      },
      baseState: { sessions: {} },
      buildAuthority: honestAuthority(["kyc.start", "kyc.document.upload"]),
    },
  },
  "pack-incident-response": {
    // incident.remediation.execute: `validateRemediationTarget` requires a live
    // incident at `incidentId`; `validateBlastRadius` requires a non-negative integer.
    "incident.remediation.execute": {
      stateValidPayload: { incidentId: INCIDENT_LIVE_ID, blastRadius: 1 },
      baseState: { incidents: { [INCIDENT_LIVE_ID]: INCIDENT_LIVE } },
      buildAuthority: honestAuthority([
        "incident.remediation.execute",
        "incident.escalate",
      ]),
    },
    // incident.escalate: `validateRemediationTarget` requires the incident to exist
    // and be non-terminal.
    "incident.escalate": {
      stateValidPayload: { incidentId: INCIDENT_LIVE_ID },
      baseState: { incidents: { [INCIDENT_LIVE_ID]: INCIDENT_LIVE } },
      buildAuthority: honestAuthority([
        "incident.remediation.execute",
        "incident.escalate",
      ]),
    },
  },
  "pack-payments-pix": {
    // pix.charge.create: no state guard fires for create (the amount check is a
    // BUSINESS guard, after auth), so a valid-amount payload reaches auth directly.
    "pix.charge.create": {
      stateValidPayload: { amountCentavos: 30_000, description: "fixture charge" },
      baseState: { charges: {} },
      buildAuthority: honestAuthority(["pix.charge.create", "pix.charge.refund"]),
    },
    // pix.charge.refund: `validateRefundTarget` REFUSEs at STATE unless the charge
    // exists and is `confirmed` — so seed a confirmed charge and target it.
    "pix.charge.refund": {
      stateValidPayload: {
        chargeId: PIX_CONFIRMED_CHARGE.id,
        refundCentavos: 10_000,
        reason: "fixture refund",
      },
      baseState: { charges: { [PIX_CONFIRMED_CHARGE.id]: PIX_CONFIRMED_CHARGE } },
      buildAuthority: honestAuthority(["pix.charge.create", "pix.charge.refund"]),
    },
  },
};

/**
 * Look up the ownership fixture for a `(packId, kind)` pair, or `undefined` when the
 * pack/kind is not fixture-covered (the legacy, not-yet-covered path).
 */
export function ownershipFixtureFor(
  packId: string,
  kind: string,
): OwnershipFixture | undefined {
  return OWNERSHIP_FIXTURES[packId]?.[kind];
}
