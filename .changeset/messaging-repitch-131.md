---
"@adjudicate/web": patch
---

marketing(web): 131 — re-pitch playground receipt copy to keyless `auditHash` reality.

Copy + diagram-only Layer-13 plan. NO kernel, pack, runtime, or response-shape change: the `PlaygroundResponse { decision, record, packId, packName, trace }` contract, the closed 6-outcome `Decision` algebra (constitutional invariant 2), the `intentHash` recipe (invariant 4), and the guard order are all preserved by construction. The re-pitch is grounded against the running code (`kernel-runner.ts` wires `adjudicateAndAudit(envelope, state, policy, { sink })` — no signer, no ledger, no `RuntimeContext`), and the §5 gates re-run the unchanged suites that PIN that behavior.

The playground demo emits a record that carries an `auditHash` only (keyless sha256 tamper-evidence): `buildAuditRecord` always sets `auditHash` and only attaches `signature` when a signer is injected, `prevAuditHash` when a chain link is supplied, and `kernelIdentity` when a `RuntimeContext` is present — none of which the playground wires. Marketing copy that asserted "signed receipt" (16+ sites) and "hash-chained, signed receipt" (home/StepReceipt.tsx) therefore overclaimed on the demoed path.

- **StepReceipt.tsx (centerpiece, T1).** The receipt headline copy now reads "tamper-evident, replayable receipt" with an `auditHash` callout instead of "tamper-evident, hash-chained, signed receipt". The annotation rail's `auditHash` entry reframes to keyless tamper-evidence (drops the false "chaining to the record before it" claim); the `signature` entry becomes a `signature · prevAuditHash` entry that honestly attributes non-repudiation and the inter-record hash-chain to the impure production shell (§D: the kernel decides; the shell signs and persists) and states the demo record shows an `auditHash` and no `signature`. The persistence rail notes the demo keeps records in memory only.

- **Playground-path copy reconciled (T1).** Hero, Playground, PlaygroundEntry, MagicMoment, OutcomesBento, StepConsole, GuidedCaseRunner, GuidedStep, ConsoleHandoff, RecipeLayout, guided-cases content, the `/playground` and `/how-it-works` route copy, the `recipes` page heading, and the site-wide `layout.tsx` metadata description now say "tamper-evident (replayable) receipt/decision" wherever they previously promised a "signed" receipt on the demoed path. Full-product / persisted-backend claims where signing + the hash-chain are genuinely delivered (FAQ "hash-chained AuditRecord with an optional signature", WhoItsFor persisted bank replay, Positioning/SocialProof/DepthLinks architecture claims, the v1 product-ships-signed-receipts announcement) are left intact — they do not describe the playground receipt path.

- **Stale cross-reference removed (T4, GuardMetadataGraph.tsx).** The "the playground surfaces the same data interactively per Pack" copy pointed at the never-mounted `PackInspector`; it now states this `/introspection` view reads `/api/playground/policy` live and links the playground only for running intents end to end.

- **Live consumer/provider boundary reconciled (T5/T6).** `policy-context.tsx` doc reflects that the shipped consumer of `/api/playground/policy` is `GuardMetadataGraph` on `/introspection` (fetched directly), and that `PackInspector`/`PolicyProvider` are not in a mounted tree. The `outcome-distribution/route.ts` doc states its in-memory sink records are NOT persisted, NOT hash-chained, NOT signed (`auditHash` only).

- **Test (kernel-runner.test.ts).** Adds a non-vacuous shape assertion that the record `runPlayground` returns carries an `auditHash` (64-char hex) and has no `signature` / `prevAuditHash` / `kernelIdentity` — the canonical backstop that keeps the new copy grounded.
