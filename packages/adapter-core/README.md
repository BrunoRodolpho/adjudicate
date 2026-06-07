# @adjudicate/adapter-core

Provider-neutral agent loop around the pure kernel: `createAdjudicatedAgent`
wires planner → renderer → bridge → kernel → decision translation into a
send/resume/confirm surface. Every intent crosses `adjudicateAndAudit`; the loop
never bypasses the kernel, raises taint, or reorders guards.

Seams: `onTokenUsage` (ADR-120) surfaces per-turn token usage; `configSeal`
(ADR-121) gates on config-integrity; `MemoryStore` + `enrichContext` /
`deriveMemoryWriteback` (ADR-126) enrich the planner/renderer context with
cross-session memory **upstream of the envelope** — memory never affects a
kernel decision.
