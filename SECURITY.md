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

**In scope:**
- Kernel decision invariants (intentHash determinism, taint monotonicity, basis vocabulary purity, schema-version gate)
- Audit ledger consistency (replay safety, dedup correctness, content-addressed deduplication)
- Capability planner (visible-tools leakage, cross-state contamination, tool classification correctness)
- Build-time supply chain (signing, SBOM provenance, package fingerprinting)

**Out of scope:**
- Adopter-side misconfigurations (bugs in your own `PolicyBundle`, `CapabilityPlanner`, or tool handlers)
- Vulnerabilities in upstream dependencies — please report those to the upstream maintainer
- Issues that require an attacker to already control the kernel host

## Versions

`v0.x` is pre-stable; security fixes apply to the latest minor only. Once `v1.0` ships, we'll backport critical fixes to the previous minor.
