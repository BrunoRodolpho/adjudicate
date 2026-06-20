/**
 * installPack — opinionated bootstrap for adopters that want sensible
 * defaults instead of plumbing every sink + conformance check by hand.
 *
 * What it does, in order:
 *
 *   1. Calls `assertPackConformance(pack)` — fails fast on malformed Packs.
 *   2. If no MetricsSink is installed, wires `createConsoleMetricsSink()`
 *      and emits a one-time `console.warn` so production deployments do
 *      not silently rely on console output.
 *   3. Returns the Pack wrapped via `withBasisAudit(...)` so refusal-code
 *      drift records a `basis_code_drift` sink-failure event.
 *
 * Adopters who manage their own observability call the lower-level
 * primitives (`assertPackConformance`, `withBasisAudit`, `setMetricsSink`)
 * directly. `installPack` is pure convenience — it never installs anything
 * destructive.
 */

import {
  createConsoleLearningSink,
  hasLearningSink,
  setLearningSink,
} from "./kernel/learning.js";
import { recordAuthoritySnapshot } from "./decision.js";
import type { AuthorityGraph, RecordedAuthoritySnapshot } from "./envelope.js";
import { createConsoleMetricsSink, hasMetricsSink, setMetricsSink } from "./kernel/metrics.js";
import { assertPlanSubsetOfPack } from "./llm/planner-conformance.js";
import {
  assertPackConformance,
  recordAuthoritySnapshotOnPack,
  withBasisAudit,
} from "./pack-conformance.js";
import type { PackV0 } from "./pack.js";

/**
 * 082 — load-time provenance verification result contracts.
 *
 * These are the MINIMAL structural shapes `installPack` needs from the
 * provenance verifiers, declared HERE (in `@adjudicate/core`) so the load path
 * never takes a build dependency on `@adjudicate/conformance` — which already
 * depends on `@adjudicate/core` (a `core → conformance` import would be a cycle).
 * The real verifiers (`verifyPackTrust`, `verifyConfigSeal`) live in conformance
 * and are INJECTED through `VerifyOnLoadOptions` (the impure shell wires them);
 * `PackTrustReport` / `ConfigSealReport` are structurally assignable to these.
 * Kernel-purity holds (§D): verification reads injected snapshots + the live
 * pack surface only — no IO, no clock, no signing here.
 */
export interface LoadTrustReport {
  /** True only when every trust axis passed under the supplied policy. */
  readonly trusted: boolean;
  readonly errors: ReadonlyArray<string>;
}

export interface LoadSealReport {
  /** True only when digest + (policy-required) signature both verified. */
  readonly verified: boolean;
  readonly errors: ReadonlyArray<string>;
}

/**
 * 082 — `installPack` refuses to install a Pack whose signature/trust or config
 * seal does not verify (fail-closed, §D-6: a write-path verification failure
 * ABORTS the install; it never installs an unverified Pack and never fails
 * open). Behind this option — when `verifyOnLoad` is absent the install path is
 * byte-identical to pre-082 (only `assertPackConformance` runs), so this is a
 * non-breaking, opt-in load gate (§7).
 *
 * Both verifiers are INJECTED (the shell supplies the conformance functions and
 * the recorded `seal` / `publicKeyPem` snapshots) so `@adjudicate/core` keeps
 * zero dependency on `@adjudicate/conformance`. Defaults are STRICT at the load
 * boundary (§3): trust `policy:"require_signature"` and seal `policy:
 * "require_signature"`, so an UNSIGNED Pack (no `signature` / no `publicKeyPem`
 * supplied) fails closed rather than installing unverified (§C: failure →
 * friction, never bypass).
 */
export interface VerifyOnLoadOptions {
  /**
   * Injected trust verifier — pass `verifyPackTrust` from
   * `@adjudicate/conformance`. Called over the pack's declarative fingerprint
   * subset with the strict load-path defaults. A report with `trusted === false`
   * ABORTS the install.
   */
  readonly verifyPackTrust: (args: {
    readonly pack: PackFingerprintLike;
    readonly expectedFingerprint?: string;
    readonly publicKeyPem?: string;
    readonly signature?: unknown;
    readonly policy?: string;
  }) => LoadTrustReport;
  /**
   * Injected seal verifier — pass `verifyConfigSeal` from
   * `@adjudicate/conformance`. Re-extracts + re-hashes the LIVE pack and checks
   * it against the injected `seal`. A report with `verified === false` ABORTS
   * the install. Omit (`seal` absent) to verify trust only.
   */
  readonly verifyConfigSeal?: (
    pack: unknown,
    seal: unknown,
    options: { readonly publicKeyPem?: string; readonly policy?: string },
  ) => LoadSealReport;
  /**
   * The recorded config-seal SNAPSHOT to verify the live pack against (injected
   * input, §D). Required for seal enforcement; when omitted, only trust is
   * checked. Under the strict default seal policy, a missing seal cannot be
   * "verified clean" — it is simply not run (trust still gates the install).
   */
  readonly seal?: unknown;
  /** Expected fingerprint to additionally pin (optional belt-and-suspenders). */
  readonly expectedFingerprint?: string;
  /** Publisher's PEM-encoded public key. REQUIRED under the strict default. */
  readonly publicKeyPem?: string;
  /** The detached signature over the fingerprint. REQUIRED under the strict default. */
  readonly signature?: unknown;
  /**
   * Trust policy. Defaults to the STRICT load posture `"require_signature"` (NOT
   * the library default `best_effort`) so absence of a valid signature refuses
   * the install (§3).
   */
  readonly trustPolicy?: string;
  /**
   * Config-seal policy. Defaults to the STRICT load posture `"require_signature"`
   * (NOT the library default `require_digest`) so a seal without a verified
   * signature refuses the install (§3).
   */
  readonly sealPolicy?: string;
}

/** Minimal declarative-subset shape the injected trust verifier fingerprints. */
export interface PackFingerprintLike {
  readonly id: string;
  readonly version: string;
  readonly contract: string;
  readonly intents: ReadonlyArray<string>;
  readonly signals?: ReadonlyArray<string>;
  readonly basisCodes?: ReadonlyArray<string>;
}

/**
 * 082 — thrown when load-time provenance verification fails. Fail-closed: the
 * install is ABORTED before any sink wiring or snapshot recording, so an
 * unverified Pack never becomes the live authority (§D-1, §D-6).
 */
export class PackLoadVerificationError extends Error {
  constructor(
    public readonly packId: string,
    public readonly axis: "trust" | "config_seal",
    public readonly errors: ReadonlyArray<string>,
  ) {
    super(
      `Pack "${packId}" failed load-time ${axis} verification: ${errors.join("; ")}`,
    );
    this.name = "PackLoadVerificationError";
  }
}

export interface InstallPackOptions {
  /**
   * When true (default), `installPack` wires `createConsoleMetricsSink()`
   * if no sink is currently set, emitting a `console.warn` to flag the
   * default. Pass false to opt out — tests typically do this.
   */
  readonly installDefaultMetrics?: boolean;
  /**
   * When true (default), `installPack` wires `createConsoleLearningSink()`
   * if no LearningSink is currently set. Same opt-out story as metrics.
   */
  readonly installDefaultLearning?: boolean;
  /**
   * When true (default), the returned Pack's policy is wrapped via
   * `withBasisAudit` so refusal-code drift is observable. Pass false only
   * if the adopter applies their own decoration.
   */
  readonly auditBasisDrift?: boolean;
  /**
   * T4 (#20): allow Packs that ship `policy.default = "EXECUTE"`. Off by
   * default — `assertPackConformance` throws on EXECUTE-default unless
   * this opt-in is passed. Read-only Packs (e.g., a "search" or "summary"
   * pack with no mutating intents) legitimately want this.
   */
  readonly allowDefaultExecute?: boolean;
  /**
   * Override for the warn line. Tests inject a vi.fn(); production uses
   * the default `console.warn`.
   */
  readonly warn?: (message: string) => void;
  /**
   * 033 — the authority-graph SNAPSHOT to INJECT into this pack's decisions.
   * `installPack` is the documented injection seam (no existing guard injection,
   * no signature check). When supplied, `installPack` content-addresses the graph
   * (`recordAuthoritySnapshot`) and exposes the RECORDED snapshot on the returned
   * `InstalledPack.authoritySnapshot`, which the impure audit shell records onto
   * the `AuditRecord` so the decision is REPLAYABLE (§D-5, invariant #5).
   *
   * **Injection seam only — 033 wires NO authority guard** (that is 034) and the
   * graph rides as an INJECTED STATE/recorded input, NOT a hashed envelope field
   * (invariant #4 untouched). The pack's `authGuards` are NOT modified here; the
   * snapshot is recorded, not consulted by any guard.
   */
  readonly authoritySnapshot?: AuthorityGraph;
  /**
   * 082 — LOAD-TIME provenance enforcement. When supplied, `installPack`
   * verifies the Pack's signature/trust (`verifyPackTrust`) and, when a `seal`
   * is provided, its config seal (`verifyConfigSeal`) BEFORE returning the
   * `InstalledPack`. A non-verifying report throws `PackLoadVerificationError`
   * and the Pack does NOT install (fail-closed, §D-6 / §C). Absent ⇒ unchanged
   * pre-082 behavior (only `assertPackConformance` runs). The verifiers are
   * INJECTED (from `@adjudicate/conformance`) so the kernel keeps no dependency
   * on conformance; defaults are STRICT (`require_signature` on both axes).
   */
  readonly verifyOnLoad?: VerifyOnLoadOptions;
}

export type InstalledDefault = "metrics" | "learning";

export interface InstalledPack<
  K extends string = string,
  P = unknown,
  S = unknown,
  C = unknown,
> {
  readonly pack: PackV0<K, P, S, C>;
  readonly installedDefaults: ReadonlyArray<InstalledDefault>;
  /**
   * 033 — the RECORDED authority snapshot (graph + content-address) when an
   * `authoritySnapshot` was injected at install. ABSENT (`undefined`) otherwise,
   * so non-injecting adopters see no behavioral change. The audit shell records
   * this onto each `AuditRecord` (via `buildAuditRecord({ authoritySnapshot })`)
   * so the decision replays bit-identically over the recorded snapshot (§D-5).
   */
  readonly authoritySnapshot?: RecordedAuthoritySnapshot;
}

export function installPack<K extends string, P, S, C>(
  pack: PackV0<K, P, S, C>,
  options: InstallPackOptions = {},
): InstalledPack<K, P, S, C> {
  const installDefaultMetrics = options.installDefaultMetrics ?? true;
  const installDefaultLearning = options.installDefaultLearning ?? true;
  const auditBasisDrift = options.auditBasisDrift ?? true;
  const warn = options.warn ?? ((msg) => console.warn(msg));

  assertPackConformance(pack, {
    allowDefaultExecute: options.allowDefaultExecute,
  });

  // 012 / T4: gate the plan at install — not opt-in at Pack construction.
  // Now that every model-proposed READ crosses the kernel, the plan's
  // `allowedIntents` are the surface the LLM may propose THROUGH the kernel;
  // a planner that advertises an intent the Pack never declared is a leak the
  // kernel's guards probably do not cover. Probe the planner with an empty
  // state and assert `assertPlanSubsetOfPack` so the misconfiguration fails
  // loud at install. A planner that legitimately throws on the empty probe
  // state (it needs real domain state) is exempt — same trust-the-contract
  // posture the conformance harness takes; the planner's own `safePlan`
  // wrapper (Pack-author convention) still gates it per real `plan()` call.
  try {
    const probeState =
      typeof pack.rehydrateState === "function"
        ? pack.rehydrateState({})
        : ({} as S);
    let plan: ReturnType<typeof pack.planner.plan> | undefined;
    try {
      plan = pack.planner.plan(probeState, {} as C);
    } catch {
      plan = undefined; // planner needs real state — skip the install probe.
    }
    if (plan !== undefined) {
      // Throws PlanConformanceError when an advertised intent is absent from
      // pack.intents — a fail-loud install gate (was opt-in via safePlan).
      // assertPlanSubsetOfPack reads only `pack.intents`, so the P/S/C widening
      // cast is sound.
      assertPlanSubsetOfPack(
        plan,
        pack as unknown as PackV0<K, unknown, unknown, unknown>,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === "PlanConformanceError") throw err;
    // Any other unexpected error from the probe is non-fatal — the install
    // gate is best-effort plan validation, not a new failure surface.
  }

  // 082 — LOAD-TIME PROVENANCE GATE (fail-closed, §D-6 / §C).
  //
  // Runs AFTER conformance (a malformed pack still fails fast) but BEFORE any
  // sink wiring, default install, or snapshot recording — so a Pack that does
  // not verify NEVER installs anything destructive and NEVER becomes the live
  // adjudication authority (§D-1: only a verified Pack can reach the executor).
  // The verifiers are INJECTED (`verifyPackTrust` / `verifyConfigSeal` from
  // `@adjudicate/conformance`) so core takes no conformance dependency. Defaults
  // are STRICT: trust + seal policies both `"require_signature"`, so an unsigned
  // Pack (no signature / no publicKeyPem) refuses the install rather than
  // installing unverified. With `verifyOnLoad` absent, this block is skipped and
  // behavior is byte-identical to pre-082.
  if (options.verifyOnLoad !== undefined) {
    const v = options.verifyOnLoad;
    const trustReport = v.verifyPackTrust({
      pack: pack as unknown as PackFingerprintLike,
      ...(v.expectedFingerprint !== undefined
        ? { expectedFingerprint: v.expectedFingerprint }
        : {}),
      ...(v.publicKeyPem !== undefined ? { publicKeyPem: v.publicKeyPem } : {}),
      ...(v.signature !== undefined ? { signature: v.signature } : {}),
      // STRICT default at the load boundary (§3) — NOT the library's best_effort.
      policy: v.trustPolicy ?? "require_signature",
    });
    if (!trustReport.trusted) {
      throw new PackLoadVerificationError(
        pack.id ?? "<unknown>",
        "trust",
        trustReport.errors,
      );
    }

    // H8 (FAIL-CLOSED): a seal snapshot supplied WITHOUT a verifier must NOT
    // install with the seal silently unenforced. Pre-fix the enforcement guard
    // below required BOTH `seal` and `verifyConfigSeal`, so omitting the verifier
    // (while still injecting a seal) fell through to a successful install with the
    // seal never checked — fail-OPEN. Refuse the install instead. (The
    // seal-ABSENT path is documented "trust only" by design and is unchanged: no
    // seal means there is nothing to enforce.)
    if (v.seal !== undefined && v.verifyConfigSeal === undefined) {
      throw new PackLoadVerificationError(
        pack.id ?? "<unknown>",
        "config_seal",
        ["seal supplied but no verifier injected — refusing to install fail-closed"],
      );
    }

    // Config-seal enforcement runs only when a seal snapshot is injected. The
    // verifier re-extracts + re-hashes the LIVE pack, so a swapped/tampered pack
    // surface drives a digest mismatch and aborts the install. Under the strict
    // default seal policy, an unsigned seal also fails closed.
    if (v.seal !== undefined && v.verifyConfigSeal !== undefined) {
      const sealReport = v.verifyConfigSeal(pack, v.seal, {
        ...(v.publicKeyPem !== undefined ? { publicKeyPem: v.publicKeyPem } : {}),
        // STRICT default at the load boundary (§3) — NOT the library's require_digest.
        policy: v.sealPolicy ?? "require_signature",
      });
      if (!sealReport.verified) {
        throw new PackLoadVerificationError(
          pack.id ?? "<unknown>",
          "config_seal",
          sealReport.errors,
        );
      }
    }
  }

  const installedDefaults: InstalledDefault[] = [];
  if (installDefaultMetrics && !hasMetricsSink()) {
    setMetricsSink(createConsoleMetricsSink());
    warn(
      "[adjudicate] using default console metrics sink — install a real sink (Sentry, PostHog) before production",
    );
    installedDefaults.push("metrics");
  }
  if (installDefaultLearning && !hasLearningSink()) {
    setLearningSink(createConsoleLearningSink());
    warn(
      "[adjudicate] using default console learning sink — install a real sink (analytics warehouse) before production",
    );
    installedDefaults.push("learning");
  }

  const wrapped = auditBasisDrift ? withBasisAudit(pack) : pack;

  // 033 — INJECTION SEAM. When an authority-graph snapshot is injected, content-
  // address it (recordAuthoritySnapshot) and STAMP the recorded snapshot onto
  // the wrapped pack via the idempotent/non-blocking pack-conformance recording
  // helper (same "wrap, don't mutate, mark with a symbol" discipline as
  // withBasisAudit). The impure audit shell reads it back and records it onto
  // each AuditRecord so the decision replays bit-identically (§D-5, invariant
  // #5). NO authority guard is wired (034) and no signature check is added (none
  // exists here today) — the snapshot rides as injected state, not a hashed
  // envelope field (invariant #4 untouched). Omitting it is byte-identical to
  // the pre-033 install (no recorded snapshot, no tag).
  const recordedSnapshot: RecordedAuthoritySnapshot | undefined =
    options.authoritySnapshot !== undefined
      ? recordAuthoritySnapshot(options.authoritySnapshot)
      : undefined;
  const installedPack =
    recordedSnapshot !== undefined
      ? recordAuthoritySnapshotOnPack(wrapped, recordedSnapshot)
      : wrapped;

  return {
    pack: installedPack,
    installedDefaults,
    ...(recordedSnapshot !== undefined
      ? { authoritySnapshot: recordedSnapshot }
      : {}),
  };
}
