/**
 * AC-001 — UNTRUSTED inputs never yield EXECUTE for taint-protected intents,
 * AND the READ path is adjudicated (012).
 *
 * This is the load-bearing zero-trust property: for every intent kind the
 * Pack declares where `policy.taint.minimumFor(kind)` requires `TRUSTED`
 * or `SYSTEM`, no UNTRUSTED-tainted envelope may produce an EXECUTE
 * Decision. If this check fails once, the Pack has a path by which
 * user-origin content escalates authority.
 *
 * Mirrors `packages/core/tests/kernel/invariants/untrusted-never-executes.property.test.ts`
 * but exercises the Pack's own `policy.taint` and `policy` rather than
 * a synthetic high-trust policy. Sampling is via the seeded LCG —
 * `Math.random()` is banned.
 *
 * **Methodology (intent path).** For each intent kind in `pack.intents` whose
 * `minimumFor()` requires TRUSTED or SYSTEM, generate `sampling`
 * UNTRUSTED-tainted envelopes (deterministic payload + nonce + timestamp)
 * and assert `adjudicate(env, {}, policy).kind !== "EXECUTE"`. Empty
 * state is intentional — the taint gate runs before state guards under
 * the T8 reorder, so an UNTRUSTED envelope can never reach business
 * guards regardless of state shape.
 *
 * **Methodology (READ path, 012).** The unadjudicated READ fast-path is gone:
 * every model-proposed READ now builds an envelope and crosses the kernel. So
 * AC-001 also samples the Pack's `visibleReadTools` (the read tool names the
 * planner advertises): each is treated as an UNTRUSTED envelope `kind` and
 * adjudicated against the Pack's OWN policy, asserting `kind !== "EXECUTE"`.
 * Under a fail-closed Pack (default REFUSE, no guard written for read tool
 * names) an UNTRUSTED read tool name never auto-EXECUTEs — proving the READ
 * path is adjudicated and a user-origin read cannot escalate authority. The
 * same seeded LCG / `sampling` / `seed` cadence as the intent path is used.
 *
 * **013/T5 seam note.** Plan 013 makes the adapter's `auditSink` non-optional
 * and fail-closes the tenant kill-switch. Those are ADAPTER/shell concerns
 * (`adapter-core` construction + `adjudicateAndAudit`'s tenant guard); they do
 * not touch the PURE-kernel `adjudicate()` taint/READ invariant this probe
 * asserts. AC-001 therefore holds UNCHANGED under 013 — only EXECUTE reaches the
 * executor (invariant #1), and the sink/kill seam can only ADD friction
 * (REFUSE/abort) on top, never turn a non-EXECUTE into an EXECUTE (§C). This
 * probe deliberately exercises `adjudicate()` directly so the property is proven
 * independent of any sink/kill wiring.
 */

import { buildEnvelope, canPropose } from "@adjudicate/core";
import { adjudicate } from "@adjudicate/core/kernel";
import type { IntentEnvelope, PackV0 } from "@adjudicate/core";
import type { ConformanceCheck, ConformanceOptions, ConformanceResult } from "../types.js";
import { deterministicNonce, deterministicTimestamp, lcg } from "../prng.js";
import { emptyStateFor } from "../state.js";

export const untrustedNeverExecutesCheck: ConformanceCheck = {
  id: "AC-001",
  name: "UNTRUSTED inputs never yield EXECUTE for taint-protected intents",
  run<K extends string, P, S, C>(
    pack: PackV0<K, P, S, C>,
    options: ConformanceOptions,
  ): ConformanceResult {
    const seed = options.seed ?? 42;
    const sampling = options.sampling ?? 100;
    const rng = lcg(seed);

    // Find every kind whose taint policy demands TRUSTED or SYSTEM —
    // those are the kinds where an UNTRUSTED EXECUTE would be a leak.
    const protectedKinds: K[] = [];
    for (const kind of pack.intents) {
      // canPropose returns false when an UNTRUSTED envelope is below the
      // minimum. We probe with UNTRUSTED — if the policy refuses it, the
      // kind is taint-protected.
      if (!canPropose("UNTRUSTED", kind, pack.policy.taint)) {
        protectedKinds.push(kind);
      }
    }

    const failures: string[] = [];
    let attempted = 0;
    const emptyState = emptyStateFor(pack);

    // ── READ path (012): collect the read tool names the planner advertises ──
    // Every model-proposed READ now crosses the kernel, so an UNTRUSTED read
    // tool name must not auto-EXECUTE under the Pack's own policy. We read the
    // planner's `visibleReadTools` against the empty state (best-effort — a
    // planner that throws on empty state contributes no read sample rather than
    // failing the check, mirroring the harness's trust-the-contract posture).
    let readTools: ReadonlyArray<string> = [];
    try {
      const plan = pack.planner.plan(emptyState, {} as C);
      readTools = plan.visibleReadTools ?? [];
    } catch {
      readTools = [];
    }

    // Vacuous only when there is NOTHING to sample on EITHER path.
    if (protectedKinds.length === 0 && readTools.length === 0) {
      return {
        id: untrustedNeverExecutesCheck.id,
        name: untrustedNeverExecutesCheck.name,
        passed: true,
        details: `No taint-protected intent kinds and no READ tools declared — invariant vacuously holds.`,
      };
    }

    for (const kind of protectedKinds) {
      for (let i = 0; i < sampling; i++) {
        attempted++;
        // Cast: `buildEnvelope` returns `IntentEnvelope<string, P>` when
        // the kind input is widened to `string`. We restore the Pack's
        // narrower `K` so the envelope re-enters the kernel's typed API.
        const envelope = buildEnvelope({
          kind: kind as string,
          payload: { __conformanceProbe: true, seed: rng() } as P,
          actor: { principal: "llm", sessionId: "conformance" },
          taint: "UNTRUSTED",
          nonce: deterministicNonce(rng),
          createdAt: deterministicTimestamp(rng),
        }) as IntentEnvelope<K, P>;
        // The taint gate runs ahead of auth guards (T8) but AFTER state
        // guards — so a state guard with a stricter precondition could
        // legitimately refuse before the taint gate fires. Either way
        // the outcome is "not EXECUTE", which is what this invariant
        // tests. Empty state comes from the Pack's own `rehydrateState`
        // when available (so its guards see the shape they expect).
        let decision;
        try {
          decision = adjudicate(envelope, emptyState, pack.policy);
        } catch (err) {
          failures.push(
            `kind="${String(kind)}" threw outside the kernel: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }
        if (decision.kind === "EXECUTE") {
          failures.push(
            `kind="${String(kind)}" with UNTRUSTED taint produced EXECUTE (nonce=${envelope.nonce})`,
          );
          // First failure per kind is enough; keep walking other kinds.
          break;
        }
      }
    }

    // ── READ path (012): an UNTRUSTED read tool name never auto-EXECUTEs ──────
    let readAttempted = 0;
    for (const readTool of readTools) {
      for (let i = 0; i < sampling; i++) {
        readAttempted++;
        const envelope = buildEnvelope({
          kind: readTool,
          payload: { __conformanceReadProbe: true, seed: rng() } as P,
          actor: { principal: "llm", sessionId: "conformance" },
          taint: "UNTRUSTED",
          nonce: deterministicNonce(rng),
          createdAt: deterministicTimestamp(rng),
        }) as IntentEnvelope<K, P>;
        let decision;
        try {
          decision = adjudicate(envelope, emptyState, pack.policy);
        } catch (err) {
          failures.push(
            `read tool="${readTool}" threw outside the kernel: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }
        if (decision.kind === "EXECUTE") {
          // A read tool name that EXECUTEs under the Pack's own (fail-closed)
          // policy means the READ path could escalate authority — the exact
          // leak the 012 routing change must prevent.
          failures.push(
            `read tool="${readTool}" with UNTRUSTED taint produced EXECUTE under the Pack policy (nonce=${envelope.nonce})`,
          );
          break;
        }
      }
    }

    if (failures.length > 0) {
      return {
        id: untrustedNeverExecutesCheck.id,
        name: untrustedNeverExecutesCheck.name,
        passed: false,
        details: `Taint/READ protection violated (${failures.length}): ${failures.join("; ")}`,
      };
    }
    return {
      id: untrustedNeverExecutesCheck.id,
      name: untrustedNeverExecutesCheck.name,
      passed: true,
      details:
        `Verified ${attempted} UNTRUSTED envelopes across ${protectedKinds.length} taint-protected kind(s); ` +
        `verified ${readAttempted} UNTRUSTED READ envelopes across ${readTools.length} read tool(s) — none EXECUTEd (012).`,
    };
  },
};
