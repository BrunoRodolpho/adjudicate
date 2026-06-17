# @adjudicate/red-team

## 0.2.1

### Patch Changes

- Updated dependencies [93d5cda]
  - @adjudicate/core@1.4.0

## 0.2.0

### Minor Changes

- 55c2494: Maturity wave — close the gaps the adversarial audit conceded:
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

- 75e85df: Red-team run-history surface (ADR-133). `@adjudicate/red-team` gains three additive, PURE helpers: `digestRedTeamReport(report)` — a deterministic "0x…" CONTENT digest (canonical-JSON sha256 via `@adjudicate/canonical`) over a report's meaningful fields (pack id, per-result name+vector+status sorted, summary counts), EXCLUDING any timestamp, so two identical-policy runs collide to one digest regardless of when they ran; `runRedTeamAcrossPacks(packs, opts)` — runs the full suite (all three vectors) against many packs in input order; and `createInMemoryRedTeamHistoryStore({ capacity? })` — a bounded, deterministic run-history store. `record(report, at)` appends one immutable `RedTeamRunRecord = { digest, at, packId, summary }`, stamped with a CALLER-SUPPLIED `at`, IDEMPOTENT on `(packId, digest)` (re-recording the same content is a no-op), with a per-pack FIFO ring (default capacity 500); `view(query?)` returns `{ runs, trend }` — runs newest-first per pack (optionally filtered by `packId` / windowed by `limit`) plus a chronological `RedTeamTrendPoint[]` (`at, packId, total, defended, escaped, errors`). NO wall-clock and NO RNG on any path — digests are timing-excluded, timestamps are caller-supplied (same clock-free posture as the existing `runRedTeam`/`generateAllVectors`). New types `RedTeamRunRecord`/`RedTeamTrendPoint`/`RedTeamHistoryView`/`RedTeamHistoryQuery`/`RedTeamHistoryStore`/`RedTeamHistoryOptions`. New `@adjudicate/canonical` dependency for the digest.

  `@adjudicate/admin-sdk` gains the read-only `governance.redTeamHistory` query (input `RedTeamHistoryQuerySchema` `{ packId?, limit? }`, `limit` capped at 500 → windows to the last N runs per pack) returning `RedTeamHistoryResultSchema` (`{ runs: RedTeamRunRecord[], trend: RedTeamTrendPoint[] }`). New schemas `RedTeamRunRecordSchema` (`{ digest: /^0x[0-9a-f]+$/, at: datetime, packId, summary }`, reusing the frozen `RedTeamSummarySchema`), `RedTeamTrendPointSchema`, `RedTeamHistoryResultSchema`, `RedTeamHistoryQuerySchema` (+ inferred types) re-declare the `RedTeamHistoryView` shape as Zod with NO dependency on `@adjudicate/red-team` — the same dependency-free posture `RedTeamReportSchema` (ADR-118) takes. New optional `AdminContext.redTeamHistory?: { view(input): RedTeamHistoryResultParsed }`; throws PRECONDITION_FAILED when absent (feature-detectable), mirroring `redTeamReport`/`governance.redTeam`. No actor required (read-only aggregates). The existing single-shot `governance.redTeam` + `RedTeamReportSchema` and `AdminContext.redTeamReport` are unchanged. No closed-enum widening (`AttackVector`/`RedTeamStatus` unchanged), no new `GovernanceEvent` taxonomy, no kernel/wire/canonical-hash change. Powers the console unified `/red-team` page (Attack categories + Pass/fail + Trend) and the public web `/transparency/red-team` clean/regressed defenses badge.

- b642424: feat(red-team): new @adjudicate/red-team package — deterministic adversarial scenario generation (prompt-injection, taint-escalation, tool-scope-violation) that asserts a Pack's kernel-level defenses hold (ADR-118).

  feat(cli): add `adjudicate red-team --pack <module>` (exit 2 on any escape/error).

  feat(admin-sdk): add `governance.redTeam` returning a pre-computed RedTeamReport for the console Red-Team panel.

### Patch Changes

- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [464db38]
  - @adjudicate/core@1.3.0

## 0.1.0

### Minor Changes

- Initial release (ADR-118). Deterministic adversarial scenario generation —
  prompt-injection, taint-escalation, and tool-scope-violation vectors — that
  asserts a Pack's kernel-level defenses hold, plus the `adjudicate red-team`
  CLI command.
