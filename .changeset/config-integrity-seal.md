---
"@adjudicate/conformance": minor
"@adjudicate/core": patch
"@adjudicate/adapter-core": minor
"@adjudicate/admin-sdk": minor
---

feat(conformance): add Configuration Integrity Seal — sealPackConfig / verifyConfigSeal pin the introspectable config surface (declarative + guard metadata + probed taint minimums + basis codes) under a signature (ADR-121). Factored shared canonicalJson into its own module.

feat(adapter-core): config-seal loop gate — verifies once per agent instance before the first adjudication; on mismatch refuses the turn (new `refused` AgentOutcome + `config_seal_violation` trace) and can engage the kill switch.

feat(core): add `kill.SEAL_MISMATCH` basis code.

feat(admin-sdk): add `governance.configSealStatus` for the console seal panel.
