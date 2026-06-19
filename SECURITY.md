# Security Policy

`adjudicate` is a security-relevant framework — vulnerabilities in the kernel, refusal logic, or audit substrate matter even when they affect adopters rather than the framework directly.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Please report privately via [GitHub Security Advisories](https://github.com/BrunoRodolpho/adjudicate/security/advisories/new). Include:
- Affected package(s) and version(s)
- Reproduction steps or proof-of-concept
- Impact assessment (what an attacker could achieve)
- Any suggested mitigation

We aim to acknowledge reports within 72 hours and to provide a fix or workaround within 7 days for high-severity issues. Coordinated disclosure typically lands within 30 days; we'll work with you on an appropriate timeline if the issue is more complex.

## Scope

The package-level threat model — what the architecture is built to resist, and
the ADR that encodes each mitigation — lives in
[`docs/security/threat-model.md`](docs/security/threat-model.md); the
constitutional invariants it leans on are catalogued in
[`docs/architecture/decisions.md` §5](docs/architecture/decisions.md) and the
ADR index ([`docs/architecture/adr/README.md`](docs/architecture/adr/README.md)).
The list below is a summary; the threat model is authoritative.

**In scope:**
- **Kernel decision invariants** — `intentHash` determinism (RFC 8785 JCS,
  re-derived fail-closed before any guard), the closed 6-outcome `Decision`
  algebra, the `state → taint → auth → business → default` guard order with
  taint short-circuiting before auth, basis-vocabulary purity, and the
  schema-version gate.
- **Monotonicity / fail-closed semantics** — every non-deterministic component
  may only raise friction, never lower it (only deterministic rules authorize
  `EXECUTE`); a throwing guard becomes a `SECURITY`/`GUARD_PANIC` `REFUSE` and
  an I/O error on the write path aborts `EXECUTE` (no fail-open default).
- **Audit ledger consistency** — replay safety (re-running the pure kernel over
  recorded snapshots reproduces the decision), content-addressed dedup, the
  `auditHash` chain, and `verifyAuditRecord` tamper-evidence on read. Note:
  `policyVersion` / `kernelVersion` are bound into the record **only when the
  host supplies them** (see threat-model R2).
- **Capability & authority surface** — capability planner visible-tools
  leakage and tool classification, signed/single-use/resource-bound
  capabilities, and the ownership/authority guard. Real IDOR closure on the
  authority guard requires the host to inject an authenticated principal
  (see the threat model's E-series and ADR-143).
- **Build-time supply chain** — guard-code signing, config-integrity seal,
  SBOM/AI-BOM provenance, and package fingerprinting.

**Out of scope:**
- Adopter-side misconfigurations (bugs in your own `PolicyBundle`,
  `CapabilityPlanner`, tool handlers, or a host that never injects
  `state.authority` / an authenticated principal — see threat-model §9.1).
- Vulnerabilities in upstream dependencies — please report those to the upstream maintainer.
- Issues that require an attacker to already control the kernel host.

## Versions

The project is in **v1.0-RC** posture. Security fixes are applied to the current release candidate. Once `v1.0` is tagged, critical fixes will be backported to the previous minor. Pre-RC (`v0.x`) releases are no longer supported.
