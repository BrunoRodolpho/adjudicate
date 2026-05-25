---
"@adjudicate/audit": minor
"@adjudicate/admin-sdk": minor
---

Sibling packages to `@adjudicate/core@1.1.0` for the audit-2026-05-24 F2
release.

**`@adjudicate/audit`** — `REASON_KEYS` and `emptyReasonCounts()` extended
to include `"lgpd_scrub"`. Without this version bump, consumers pinning
`^1.0.0` would receive `audit@1.0.1` whose `reasonCounts[r]++` against the
new reason yields `undefined++` = `NaN`, corrupting downstream operator
dashboards.

**`@adjudicate/admin-sdk`** — `SupersessionReasonSchema` Zod enum extended
to include `"lgpd_scrub"`. Without this version bump, consumers pinning
`^1.0.0` would receive `admin-sdk@1.0.0` whose schema rejects the new
literal with `"Invalid enum value"`, 500-ing every admin tRPC route that
wraps audit queries.

Both packages remain backwards-compatible at the runtime layer (new
literal is purely additive to the union). See `RELEASE-1.1.0.md` for the
coordinated release sequence.
