# Ops runbook: config-seal kill-switch recovery

> WS-A / ADR Appendix D. What to do when a config-seal mismatch engages the
> kill switch (`engageKillSwitchOnMismatch`) and the loop fail-closes.

## When this fires

When `engageKillSwitchOnMismatch` is enabled and `verifyConfigSeal` reports a
mismatch (digest drift, or — under `require_signature` — a missing/invalid
signature), the adapter latches the kill switch and **refuses every turn** until
the latch is cleared. This is intentional fail-closed behavior: a config that no
longer matches its trusted seal is treated as untrusted.

> **Status.** `engageKillSwitchOnMismatch` defaulting on (with
> `policy: "require_signature"`) is the **deferred WS-A breaking change**. Today
> it is opt-in. This runbook applies wherever it is enabled.

## 1. Triage — benign drift vs tamper

Read the verification report (`ConfigSealReport`) and the deploy timeline.

| Signal | Likely cause | Class |
| --- | --- | --- |
| Digest changed right after an intended Pack/policy edit | a real surface change you forgot to re-seal | **benign** |
| Signature invalid but digest matches a known-good build | wrong/stale public key, or a key rotation mid-flight | **benign (key)** |
| Digest changed with **no** corresponding code change | tamper, or an unauthorized config swap | **tamper** |
| Signature invalid **and** digest unrecognized | tamper | **tamper** |

When in doubt, treat it as tamper until proven benign.

## 2a. Benign drift — re-seal

1. Confirm the new sealable surface (intents / basis codes / signals) is the
   **intended** one (diff against the last trusted seal).
2. Re-sign: `sealPackConfig(surface, { privateKeyPem })` with the current private
   key (see [config-seal-key-management.md](./config-seal-key-management.md)).
3. Deploy the new seal alongside the matching Pack.
4. Clear the latch (step 3) and confirm verification passes.

## 2b. Benign (key) — fix trust material

1. If a rotation is in flight, ensure the verifier trusts the **new** public key
   (dual-trust during the overlap window).
2. If the wrong public key was pinned, correct it and redeploy the verifier
   config. Do **not** weaken the policy to `require_digest` to "get unblocked" —
   that silently drops tamper detection.
3. Clear the latch and confirm.

## 2c. Tamper — contain first

1. **Do not clear the latch.** Fail-closed is the correct state; keep turns
   refused.
2. Preserve the offending config + seal + report for investigation.
3. Rotate the signing key if compromise is suspected (key-management runbook,
   "Loss / compromise").
4. Restore a known-good, re-signed seal + Pack from a trusted source.
5. Only then clear the latch (step 3).

## 3. Clear the latch (re-seal → propagate)

The kill-switch latch is in-process. To clear it:

1. Ensure a **trusted, matching** seal is deployed (re-sealed per 2a/2b/2c).
2. Restart / re-initialize the adapter instances so the latch resets and
   `verifyConfigSeal` re-runs clean on boot.
3. Confirm the report is `verified` with the expected policy.

## 4. Fleet propagation

A fleet latches per-instance. After a re-seal:

- Roll the new seal to **every** instance; a stale instance stays latched (and
  correctly refuses) until it receives the matching seal.
- Watch for instances that clear vs. stay latched — a persistent latch on one
  host means it has not received the new seal (or has a different public key).
- For `require_signature`, distribute the public key **before** the re-signed
  seal so no verifier fail-closes on a signature it cannot check.

## Determinism boundary

Seal verification and the kill switch run at load / around the loop, never inside
`adjudicate()`. Clearing a latch is an operational action; it never alters
`intentHash` / policy / state or replay determinism.
