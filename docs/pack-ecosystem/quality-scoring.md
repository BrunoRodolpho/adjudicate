# Pack Quality Scoring — Bronze / Silver / Gold

> Status: **Specification, v0.3.0.** The score is computed but not enforced.
> Adopters self-attest Bronze/Silver in v0.3–v0.5; Gold certification is
> reviewed by the framework team. The marketplace UI (post-v1.0) surfaces
> the scores.

## Why a tier system

Adjudicate Packs ship arbitrary policy logic that adopters trust to gate
state mutations. Without external signal, an adopter discovering a Pack
on npm has no way to assess: *is this production-grade? does it cover
edge cases? is it actively maintained?*

The tier system surfaces three answers:

- **Bronze** — *functional*. It compiles, lints, and exercises at least
  one canonical scenario per Decision outcome.
- **Silver** — *thorough*. It exercises all six Decision outcomes,
  passes `adjudicate analyze --strict`, declares full `GuardMetadata`
  on every guard, and follows semver discipline.
- **Gold** — *production-grade*. Silver + cryptographic signing, an
  attested security review, ≥2 active maintainers, and a public
  production reference.

## Tier requirements

### Bronze 🥉

| Requirement | Verification |
|---|---|
| Compiles cleanly (`tsc --noEmit`) | CI build |
| Lints cleanly | `pnpm lint` |
| Passes `pnpm test` | CI tests |
| Declares `contract: "v1"` (or `"v0"` for legacy) | `assertPackConformance` |
| `Pack.intents` is a non-empty array of unique strings | `assertPackConformance` |
| `Pack.basisCodes` is a non-empty array | `assertPackConformance` |
| At least one scenario fixture per intent kind | `simulate --scenarios` |
| `policy.default` is `"REFUSE"` OR explicitly opted into `"EXECUTE"` | `assertPackConformance` |

### Silver 🥈

All Bronze requirements plus:

| Requirement | Verification |
|---|---|
| Exercises all 6 Decision outcomes via scenarios | `simulate --scenarios` |
| `adjudicate analyze --strict` passes with zero diagnostics | Analyzer |
| Every guard carries `GuardMetadata` (factory-built OR `nameGuard`) | Analyzer AJD-101 |
| Pack declares full `Pack.signals` set (every DEFER guard maps) | Analyzer AJD-102 |
| Every guard-emitted basis code appears in `Pack.basisCodes` | Analyzer AJD-103 |
| Strict semver discipline (no breaking change without major bump) | Manual review |
| Coverage report: ≥80% line coverage | Vitest coverage |
| Pack version declares `kernelMinVersion` (semver range) | `assertPackConformance` (PackV1) |

### Gold 🥇

All Silver requirements plus:

| Requirement | Verification |
|---|---|
| Cryptographic signing of every release (Sigstore cosign) | Registry verification |
| Independent security review (third-party or framework team) | Attestation document |
| ≥2 active maintainers (commits in last 90 days) | Git log |
| ≥3 public production deployments | Self-attestation + references |
| Stable releases for 12 months without major breaking changes | Release history |
| `@adjudicate/adapter-conformance` passes if Pack ships an adapter | Conformance suite |

## Marketplace surface (post-v1.0)

The Pack registry surfaces tier badges next to each Pack:

```
@adjudicate/pack-payments-pix      🥇 Gold      v1.2.3
@adjudicate-community/pack-stripe   🥈 Silver    v0.4.0
@adjudicate-community/pack-zendesk  🥉 Bronze    v0.1.5
```

Adopters can filter by minimum tier. The default search filter is Silver+.

## How the tier is computed

Bronze + Silver are computed by tooling:
- `adjudicate pack lint --strict` returns the tier as exit metadata.
- The registry runs the same lint against each published version and
  publishes the result alongside the package.

Gold is **reviewed** — the framework team or a delegated security
reviewer signs an attestation that becomes part of the registry record.

## When a Pack drops a tier

Tier is computed per-version. A Silver Pack that lands a `package.json`
without `kernelMinVersion` drops to Bronze for that version. The
registry retains historical tiers per version so adopters pinning to a
specific version see that version's tier.
