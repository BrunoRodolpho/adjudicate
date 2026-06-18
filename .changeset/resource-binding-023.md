---
"@adjudicate/core": minor
"@adjudicate/adapter-core": minor
"@adjudicate/runtime": minor
"@adjudicate/adjutant": minor
"@adjudicate/pack-payments-pix": patch
"@adjudicate/pack-incident-response": patch
"@adjudicate/pack-access-governance": patch
---

feat(core): 023 — resource-binding verifier (`verifyResourceBinding`, `ResourceBindingPolicy`, `ResourceBindingResult`, `DEFAULT_RESOURCE_BINDING_POLICY`) in `envelope.ts`. Re-derives the envelope's `intentHash` via the UNTOUCHED `intentHashInput` recipe (`deriveIntentHash`) and constant-time-compares it against the carried hash with `timingSafeHexEqual` — the executor must honor ONLY the kernel-bound (signed) payload. A `payload` / `resourceRefs` (031) swapped AFTER the kernel decision re-derives a DIFFERENT hash and fail-closes (anti-IDOR / anti-resource-swap; invariants #1, #4, #6). The `intentHashInput`/`buildEnvelope`/`deriveIntentHash` bodies are BYTE-IDENTICAL (additive-only file change), so every existing envelope hash, golden vector, and replay corpus is unchanged (invariant #5). No `node:crypto`, no `Buffer` — core stays browser-bundleable (pure-JS canonical fence). The passive `AuditRecord.signature` slot stays PASSIVE — 023 is a hash fence only; the AuditSigner is plan 092. The bound envelope inputs are already recorded on the AuditRecord for replay.

feat(adapter-core): 023 — enforce the resource binding at the executor seam (`runExecute`, `decisions.ts`) before `invokeIntent`, threaded via a new `resourceBindingPolicy` option (default `"strict"`). The check SUBSUMES the 011/T4 forged-REWRITE re-verify AND EXTENDS the same fence to the EXECUTE payload, so a post-decision resource-swap can never reach the executor (invariant #1). Coexists with 012 (reads serve via `invokeRead`, never reach this gate) and 013 (the kernel crossing that produced the Decision already emitted the required AuditRecord) — none weakened. `"warn"` still fail-closes a mismatch (friction never decreases, §C); `"off"` is the documented rollback dial restoring the exact pre-023 seam. Re-exports `verifyResourceBinding` from the barrel so the seam pins ONE recipe. The `AdopterExecutor.invokeIntent` contract now documents that it receives only the kernel-bound payload.

feat(runtime): 023 — re-export `verifyResourceBinding` / `ResourceBindingPolicy` and a T4 cross-drift note pinning that the resource-binding pre-image equals the parked-envelope verifier's pre-image (`verifyParkedEnvelopeHash`) — the SAME canonical recipe + comparator, so the executor-seam binding and the resume-time park check cannot disagree (no drift; invariants #4/#5).

feat(adjutant): 023 — `assertResourceBound` fence at the orchestrator's direct `invokeIntent` seam (it has no `runExecute`): re-derive + constant-time-compare the envelope's `intentHash` before the side effect in both `handle` (EXECUTE) and `resolve` (confirmation EXECUTE), so a swapped/forged proposal envelope fail-closes before the executor (anti-IDOR).

feat(pack-*): 023 — document the bound-payload contract on the three shipped packs' `capabilities.ts` (pix / incident-response / access-governance): an LLM-proposable intent reaches the adopter's executor ONLY through a binding-enforced seam, so the executor honors only the exact kernel-adjudicated `payload` / `resourceRefs`.
