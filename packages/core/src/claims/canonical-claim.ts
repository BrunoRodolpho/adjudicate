// @adjudicate/core — CanonicalClaim: the kernel-minted, runtime-non-forgeable
// carrier that is the renderer's REQUIRED input. The type-level form of inv.17
// ("canonical claim instance"): only the Claims kernel, on a claim that fully
// VALIDATED (the §5 soundness predicate, incl. C6 value-binding) AND survived P2
// consistency into the `renderable` set, may mint one. The renderer cannot run
// without a kernel-minted CanonicalClaim — so an un-validated / model-confabulated
// proposition can never reach prose.
//
// This mirrors `rendered-reply.ts` EXACTLY (same three defense-in-depth legs) but
// guards the OTHER end of the egress loop:
//
//   model value → C6 ledger-bound → CanonicalClaim (kernel mint, ENTRY brand)
//     → render() → RenderedReply (EXIT brand) → unwrapRendered at the sink.
//
// CanonicalClaim guards the renderer's ENTRY; RenderedReply guards its EXIT.
//
// WHY AN OBJECT WRAPPER, NOT A BRANDED VALUE
// ──────────────────────────────────────────
// A branded primitive (`T & { __brand }`) is erased by tsc: at runtime it is an
// ordinary value, forgeable by any literal `as CanonicalClaim`, with NO runtime
// membership test. inv.17 demands RUNTIME non-forgeability, so the carrier is a
// frozen HEAP object trackable in a module-private `WeakSet`; `unwrapCanonical`
// proves provenance at the renderer boundary by asserting WeakSet membership — a
// forged object literal that structurally matches `CanonicalClaim` throws.
//
// MINT-SITE SOUNDNESS (honest scope — see critique risk #3)
// ─────────────────────────────────────────────────────────
// The single mint site is `runClaimsKernel` (kernels.ts), called on each member
// of the `renderable` set — the VALIDATED ∧ P2-consistent survivors. The guarantee
// the mint carries is precise:
//   · `VALIDATED` alone does NOT imply C6 ran: a type WITHOUT a `valueBinding`
//     skips C6 (soundness.ts) and can still reach VALIDATED.
//   · The renderer only fills PROPOSITION slots; the ClaimDefinition compiler's
//     INV-1 forces every proposition slot to a `valueBinding`-backed projection.
//   · Therefore: has-render-proposition ⟹ has-valueBinding ⟹ C6 RAN ⟹ the value
//     equals its licensing ledger entry's value (C6 is a conjunct of claimAllowed;
//     a mismatch is REFUSED, never VALIDATED). So for any claim the renderer
//     actually reads, the minted value is provably the LEDGER-derived value, not a
//     model confabulation. The mint flows the renderable claim's `value`, which —
//     for exactly those C6-bound claims — IS the ledger value by construction.

/**
 * The module-private brand key. NEVER exported. Because the symbol is not in
 * scope anywhere outside this file, no external module can write an object
 * literal whose key is `[canonicalBrand]`, so `CanonicalClaim` is opaque at the
 * type level (compile-time leg of defense-in-depth, layer (a)).
 */
declare const canonicalBrand: unique symbol;

/**
 * An opaque, runtime-non-forgeable canonical claim instance — the renderer's
 * REQUIRED input type.
 *
 * The only way to obtain one is the kernel-internal mint (this module's
 * {@link mintCanonicalClaim}, called solely by `runClaimsKernel`); the only way to
 * read the carried fields is {@link unwrapCanonical}, which asserts the value was
 * genuinely minted here. Treat instances as immutable.
 *
 * Carries exactly the renderer-relevant identity of a renderable claim:
 *   - `subject` — the same-subject partition key (P2);
 *   - `type`    — the registry type name (selects the render template);
 *   - `value`   — the LEDGER-derived domain proposition the renderer fills from
 *                 (provably ledger-bound for any claim with a render proposition;
 *                 see the mint-site soundness note above).
 */
export interface CanonicalClaim {
  readonly subject: string;
  readonly type: string;
  readonly value: unknown;
  readonly [canonicalBrand]: true;
}

/**
 * Runtime membership registry — every minted claim is inserted here, and
 * {@link unwrapCanonical} asserts presence before yielding the fields. A
 * `WeakSet` (not `Set`) so minted claims stay garbage-collectable; the keys are
 * the claim objects themselves, which is why the carrier MUST be a heap object
 * (defense-in-depth, layer (b)).
 */
const MINTED = new WeakSet<object>();

/**
 * The single internal construction point. Frozen so the carrier is immutable;
 * funnels into the one `MINTED` WeakSet so there is exactly ONE place that
 * creates a branded object and exactly ONE provenance registry.
 */
function mint(subject: string, type: string, value: unknown): CanonicalClaim {
  const claim = Object.freeze({ subject, type, value }) as unknown as CanonicalClaim;
  MINTED.add(claim);
  return claim;
}

/**
 * PACKAGE-INTERNAL kernel mint. Deliberately NOT re-exported from the package
 * barrel (`index.ts` / `claims/index.ts` export only the {@link CanonicalClaim}
 * type and {@link unwrapCanonical}) — there is no PUBLIC constructor, per inv.17.
 *
 * The SOLE legitimate caller is `runClaimsKernel`, on a claim that is in the
 * `renderable` set (VALIDATED ∧ P2-consistent). Do not introduce other call
 * sites: minting outside the kernel-validated path would forge canonicity.
 *
 * @internal
 */
export function mintCanonicalClaim(
  subject: string,
  type: string,
  value: unknown,
): CanonicalClaim {
  return mint(subject, type, value);
}

/**
 * Read the carried fields at the renderer boundary, AFTER proving the value was
 * minted by this module. A forged object literal that structurally satisfies
 * `CanonicalClaim` (only constructible via `as`, which the lint layer (c) bans)
 * is rejected here at runtime (defense-in-depth, layer (b)).
 *
 * @throws {Error} if `claim` was not produced by the kernel mint in this module.
 */
export function unwrapCanonical(claim: CanonicalClaim): {
  readonly subject: string;
  readonly type: string;
  readonly value: unknown;
} {
  if (!MINTED.has(claim)) {
    throw new Error(
      "unwrapCanonical: forged or non-minted CanonicalClaim reached the renderer. " +
        "Canonical claims must be minted by runClaimsKernel on the VALIDATED+consistent " +
        "renderable set, never cast with `as CanonicalClaim`.",
    );
  }
  return { subject: claim.subject, type: claim.type, value: claim.value };
}
