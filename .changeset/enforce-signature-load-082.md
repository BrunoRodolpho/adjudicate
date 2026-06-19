---
"@adjudicate/core": minor
"@adjudicate/conformance": patch
"@adjudicate/adapter-core": patch
"@adjudicate/primitives": patch
"@adjudicate/cli": patch
---

feat(core,conformance,adapter-core,primitives,cli): 082 — enforce the SIGNED pack at LOAD time (`installPack`). The adopter's in-process load path now REFUSES to install a Pack whose signature/trust or config seal does not verify, so a swapped/unsigned/tampered Pack cannot become the live adjudication authority (§D-1: only a verified Pack reaches the executor; §D-6: a write-path verification failure ABORTS the install; §C: failure → friction, never bypass). Fail-closed by default; behind the new `verifyOnLoad` option so an absent option is byte-identical to pre-082 (only `assertPackConformance` runs).

- **T1 (`core/src/install.ts`):** add `VerifyOnLoadOptions` to `InstallPackOptions` and a FAIL-CLOSED provenance gate inside `installPack` that runs AFTER conformance but BEFORE any sink wiring / default install / snapshot recording, so a Pack that does not verify installs NOTHING destructive. The verifiers (`verifyPackTrust` / `verifyConfigSeal`) are INJECTED through `verifyOnLoad` — `@adjudicate/core` takes NO dependency on `@adjudicate/conformance` (which already depends on core; a `core → conformance` import would be a cycle, and the kernel dep allowlist stays clean: `@adjudicate/canonical, @noble/hashes, zod`). Defaults are STRICT at the load boundary: trust policy `require_signature` (NOT the library `best_effort`) and seal policy `require_signature` (NOT `require_digest`), so an UNSIGNED Pack (no signature / no publicKeyPem) refuses the install. A non-verifying report throws the new `PackLoadVerificationError` (axis: `trust` | `config_seal`). New exports: `VerifyOnLoadOptions`, `LoadTrustReport`, `LoadSealReport`, `PackFingerprintLike`, `PackLoadVerificationError` (all additive; recorded in the V1 freeze matrix). The pure `adjudicate()` path and `intentHashInput` are UNTOUCHED — this is impure install-shell wiring (§D).

- **T2 (`conformance/src/index.ts`):** confirm + document that `verifyPackTrust` (`pack-trust.ts`) and `verifyConfigSeal` (`config-seal.ts`) are the single public verifiers the core load path injects; the pre-existing verifiers are unchanged.

- **T3 (`adapter-core/src/types.ts`):** document the STRICT KNOB PAIRING on `AgentLoopOptions.configSeal` — operators must set `policy:"require_signature"` + `publicKeyPem` + `engageKillSwitchOnMismatch:true` together for fail-closed runtime posture (the same enforcement the load path runs by default). The runtime enforcement path (`loop.ts` `checkConfigSeal`) already honors this; documented, not silently relied upon (082 §7 risk: lax adapter default).

- **T4 (`primitives/src/guards.ts`):** inline residual-blind-spot note at the `createRewriteGuard` code-artifact site — a clean seal proves SIGNATURE + sealed-surface provenance, NOT behavioral correctness of every closure (a state-derived `cap` pins the function source, not its runtime value), so load-time enforcement does not over-claim; closing the cap-pinning gap is 081's upstream scope.

- **T5 (`cli/src/commands/pack-verify.ts`, `cli/src/bin.ts`):** align the `pack verify` command docs with the load-path posture — CI/adopters should run `--policy require_signature --public-key --signature` (+ `--expect-seal`) so the CLI gate and the runtime `installPack` load gate agree. The runtime `--policy` default stays `best_effort` for backwards-compatible local dev.

- **T6 (tests):** `core/tests/install.test.ts` exercises the fail-closed gate with REAL ed25519 sign/verify (refuses unsigned / wrong-key / drifted-seal / unsigned-seal; installs a validly signed pack + matching signed seal; verifies no sinks install on failure; absent option ⇒ unchanged). `conformance/tests/pack-trust.test.ts` + `config-seal.test.ts` add the explicit `require_signature` load-path defaults (ed25519 + rsa-pss over the fingerprint; re-extract/re-hash of the LIVE pack), each with accept + fail-closed cases.

Invariants preserved: kernel purity/determinism/replay (verification reads injected snapshots + the live pack surface only; no IO/clock/RNG; `intentHashInput` byte-identical), the closed 6-outcome `Decision` algebra (no new outcome), fail-closed (#6), and monotonicity (§C — an unverified Pack only ADDS friction by refusing to install).
