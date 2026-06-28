---
"@adjudicate/core": minor
---

R1 claims-runtime kernel correctness:

- 3-value `OriginProvenance` axis (`FIRST_PARTY | TRUSTED_THIRD_PARTY | UNTRUSTED_DATA`), distinct from the 2-value `LedgerTaint` — de-vacuums the `first_party_only` provenance gate so first-party money reads (e.g. `PAYMENT_STATUS`) are actually protected. Fail-closed: nothing auto-promotes to `FIRST_PARTY`.
- C4 soundness broadened to `action_outcome` reads + negative-age lower bound on freshness.
- P2 consistency: same-type discrimination; conservative `sameValue` rejects non-plain objects (distinct `Date`/`Map`/`Set` now surface an H3 same-key conflict → `UNKNOWN` instead of being silently treated as equal).

Strengthens evidence-soundness gates only (monotonic, fail-closed); no gate is relaxed.
