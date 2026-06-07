---
"@adjudicate/primitives": patch
"@adjudicate/pack-deployments-approval": patch
"@adjudicate/red-team": minor
"@adjudicate/observability": minor
"@adjudicate/pack-access-governance": minor
---

Maturity wave — close the gaps the adversarial audit conceded:

- **primitives (command-risk):** the REFUSE tier now covers `rm -rf ~`,
  `rm -rf $HOME`/`${HOME}`, `rm -rf /*` (not just `rm -rf /`) and is
  case-insensitive for the destructive rules; a recursive `rm` against a specific
  recoverable path still only CONFIRMs.
- **pack-deployments-approval:** the carbon clamp is now data-residency-bounded
  (`REGION_RESIDENCY` + `greenestRegionInZone`) — an EU deploy is only relocated
  to a greener EU region, never across a residency boundary; unknown regions are
  left untouched (fail-safe). Closes the GDPR foot-gun.
- **red-team:** new `taintEscalationCausality` distinguishes taint-gate defenses
  from precondition defenses, so `escaped===0` is no longer a vacuous guarantee.
  The PIX fixture documents that preconditions fire first; a precondition-free
  pack proves the taint gate genuinely fires.
- **observability:** ships `createLexicalGroundednessScorer`, a deterministic
  reference `HallucinationScorer` (1 − claim/evidence containment), so the
  ADR-124 scoring seam ships with working code, not just an interface.
- **pack-access-governance:** the pack now actually uses
  `createDataClassificationGuard` — it REWRITE-redacts PII (SSN/email) from the
  free-text `access.request` justification (taint preserved) before processing.

Console (reference UI, unversioned): the hallucination badge now renders real
buckets; the Tier-3 analyzer no longer emits false unreachable-intent warnings
(authenticated planner probes); behavioral-drift `evaluate()`/`onDrift` is wired
and the demo stream actually drifts; the approvals panel is clearly labeled a
display-only projection (production authorization runs through the approval
engine). Web playground: stronger PII demo patterns (dashless SSN, grouped PAN).
