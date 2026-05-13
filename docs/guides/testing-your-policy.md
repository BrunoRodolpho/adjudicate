# Test your policy

> A short walkthrough of how to write declarative scenarios for an
> adjudicate Pack, run them locally and in CI, and catch decision
> regressions before they ship.

This guide assumes you've already built a Pack — read [Concepts](../concepts.md) first if not. The convention applies equally to the framework's reference Packs (`@adjudicate/pack-payments-pix`, `@adjudicate/pack-identity-kyc`) and to your own.

---

## Why scenarios

A Pack's `PolicyBundle` is code; the only way to verify what it does is to feed it envelopes and inspect the resulting `Decision`. Two pieces of audience-shaped tooling sit on top of that:

| Surface | Audience | When it runs | Output |
|---|---|---|---|
| Programmatic tests (`vitest`) | Maintainers, CI | Every commit, every PR | Pass / fail with stack trace |
| Declarative scenarios (`adjudicate simulate --scenarios`) | Adopters, compliance reviewers, dev manual verification | On demand or in CI | Diff summary table |

The same JSON shape backs both — a scenario is a Pack-level contract document. Programmatic tests guard against silent regressions; the CLI diff renders a human-readable verdict for non-engineers reviewing a policy change.

---

## Anatomy of a scenario

```jsonc
{
  "intent": {
    "kind":     "pix.charge.refund",        // the IntentEnvelope.kind
    "payload":  { "chargeId": "c-1", "refundCentavos": 60000, "reason": "x" },
    "actor":    { "principal": "llm", "sessionId": "sess-1" },
    "taint":    "UNTRUSTED",
    "nonce":    "scenario-01-refund-confirm"
  },
  "state": {
    "charges": {
      "c-1": { "id": "c-1", "amountCentavos": 100000, "status": "confirmed" }
    }
  },
  "expected": { "kind": "REQUEST_CONFIRMATION" }
}
```

Three fields, each load-bearing:

- **`intent`** is the user-supplied portion of `IntentEnvelope`. The CLI passes it through `buildEnvelope` to fill `version` and compute `intentHash` — you never hand-author hashes.
- **`state`** is plain JSON. If your Pack uses runtime shapes that don't round-trip JSON (`Map`, `Set`, `Date`), export a `rehydrateState` on the Pack (see [the rehydration convention](#the-rehydration-convention)).
- **`expected`** is optional. With it, the scenario becomes a regression test in CI. Without it, the scenario is *advisory* — the CLI shows the result but doesn't fail.

---

## A working example

Reference Pack: `@adjudicate/pack-payments-pix`. Six scenarios live in [`packages/pack-payments-pix/scenarios/`](../../packages/pack-payments-pix/scenarios) — one per Decision outcome:

| File | Outcome | What it covers |
|---|---|---|
| `01-refund-execute.json` | EXECUTE | Small refund (1000 centavos) against a confirmed charge |
| `02-refund-request-confirmation.json` | REQUEST_CONFIRMATION | Medium refund (60_000) crosses the confirm threshold |
| `03-refund-escalate.json` | ESCALATE | Large refund (150_000) crosses the supervisor threshold |
| `04-refund-rewrite-overshoot.json` | REWRITE | Refund > charge amount is clamped down |
| `05-charge-create-defer.json` | DEFER | `pix.charge.create` parks awaiting webhook |
| `06-refund-refuse-not-found.json` | REFUSE | Refund against a nonexistent charge |

Run them:

```bash
pnpm --filter @adjudicate/pack-payments-pix build
pnpm --filter @adjudicate/pack-payments-pix test:scenarios
```

The CLI renders the diff summary:

```
pack: pack-payments-pix

✓ 01-refund-execute               EXECUTE               (expected EXECUTE)
✓ 02-refund-request-confirmation  REQUEST_CONFIRMATION  (expected REQUEST_CONFIRMATION)
✓ 03-refund-escalate              ESCALATE              (expected ESCALATE)
✓ 04-refund-rewrite-overshoot     REWRITE               (expected REWRITE)
✓ 05-charge-create-defer          DEFER                 (expected DEFER)
✓ 06-refund-refuse-not-found      REFUSE                (expected REFUSE)

6 matched
```

---

## Wiring it into your Pack

Three small changes turn any Pack into a scenario-tested Pack.

### 1. Add a `scenarios/` directory

```
packages/pack-my-domain/
├── scenarios/
│   ├── 01-happy-path.json
│   ├── 02-edge-refuse.json
│   └── ...
├── src/
└── tests/
```

Convention: top-level `*.json` files, alphabetically numbered for stable diff output. The CLI walker does not recurse.

### 2. Wire the `test:scenarios` script

```json
// packages/pack-my-domain/package.json
{
  "scripts": {
    "test:scenarios": "adjudicate simulate --pack ./dist/index.js --scenarios ./scenarios"
  },
  "devDependencies": {
    "@adjudicate/cli": "workspace:*"
  }
}
```

`pnpm pack init` scaffolds this for you. For existing Packs, add it once.

### 3. Add a vitest conformance test (the CI gate)

Keep the CLI script for dev verification and add a fast vitest test that runs on every `pnpm test`:

```ts
// packages/pack-my-domain/tests/scenarios.test.ts
import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { adjudicate, buildEnvelope } from "@adjudicate/core";
import { myDomainPack, rehydrateMyDomainState } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.join(__dirname, "..", "scenarios");

describe("scenarios — fixture conformance", () => {
  it("every scenario produces its expected decision", async () => {
    const files = (await readdir(SCENARIOS_DIR))
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const file of files) {
      const scenario = JSON.parse(
        await readFile(path.join(SCENARIOS_DIR, file), "utf8"),
      );
      const envelope = buildEnvelope({ ...scenario.intent });
      const state = rehydrateMyDomainState(scenario.state);
      const decision = adjudicate(envelope, state, myDomainPack.policy);
      expect(
        decision.kind,
        `scenario ${file}: expected ${scenario.expected.kind}, got ${decision.kind}`,
      ).toBe(scenario.expected.kind);
    }
  });
});
```

This test runs with no external bin, no Pack dynamic-import, no fs walker — pure `@adjudicate/core` + your Pack's own surface. Fast CI gate.

---

## The rehydration convention

The kernel reads state through your Pack's guards. If the guards expect `Map<string, Charge>` (because that's idiomatic for in-memory implementations), JSON-deserialized state — which is always plain objects — will throw the first time a guard calls `state.charges.get(...)`.

Export a `rehydrateState` on your Pack to convert:

```ts
import type { PackV0 } from "@adjudicate/core";

export function rehydrateMyDomainState(raw: unknown): MyDomainState {
  if (typeof raw === "object" && raw !== null && "entities" in raw) {
    const entities = (raw as { entities: unknown }).entities;
    if (entities instanceof Map) {
      return { entities: entities as ReadonlyMap<string, MyEntity> };
    }
    if (typeof entities === "object" && entities !== null) {
      return {
        entities: new Map(
          Object.entries(entities as Record<string, MyEntity>),
        ),
      };
    }
  }
  return { entities: new Map() };
}

export const myDomainPack = {
  // ...
  rehydrateState: rehydrateMyDomainState,
} as const satisfies PackV0<...>;
```

Be permissive on input — treat absent/malformed fields as empty containers, and treat already-rehydrated input (state passed directly from production) as a pass-through. The policy's guards are the authoritative validators; `rehydrateState`'s job is just the shape translation.

Packs whose state is already plain JSON (records, arrays, primitives) don't need this — omit `rehydrateState` entirely.

---

## CI integration

The vitest test from §[3](#3-add-a-vitest-conformance-test-the-ci-gate) is the default. For an additional human-readable gate that produces the diff summary table, add the CLI invocation:

```yaml
# .github/workflows/ci.yml (excerpt)
- run: pnpm install
- run: pnpm -r build
- run: pnpm -r test
- run: pnpm --filter "@adjudicate/pack-*" test:scenarios
```

Exit codes:
- `0` — all scenarios match (or are advisory).
- `1` — one or more scenarios failed to load (malformed JSON, schema error). No mismatches.
- `2` — one or more `decision.kind !== expected.kind`. Mismatch wins over error — a policy regression is the more actionable signal.

---

## Iteration workflow

Three common scenario-authoring patterns:

**1. Capture an outcome that surprised you.** A bug report says "the LLM refunded R$ 10,000 without confirmation." You add `scenarios/regression-10k-refund.json` with `expected: ESCALATE`, watch it fail, fix the policy, watch it pass. The scenario stays in the suite as a regression guard.

**2. Pin a borderline decision.** Two adjacent threshold values produce different outcomes. Add scenarios at both sides (49_999 → REQUEST_CONFIRMATION, 50_000 → REQUEST_CONFIRMATION, 99_999 → REQUEST_CONFIRMATION, 100_000 → ESCALATE). Boundary documentation that doubles as a test.

**3. Demonstrate an attack defense.** The PIX scenarios include [`06-refund-refuse-not-found`](../../packages/pack-payments-pix/scenarios/06-refund-refuse-not-found.json); the KYC scenarios include [`06-vendor-taint-refuse`](../../packages/pack-identity-kyc/scenarios/06-vendor-taint-refuse.json) — UNTRUSTED actor proposing a `kyc.vendor.callback`, which the system-only taint policy refuses. These scenarios *prove* the defense; if anyone weakens the taint policy in the future, this scenario breaks first.

---

## Common gotchas

- **`taint` is a closed enum.** Valid values: `"SYSTEM"`, `"TRUSTED"`, `"UNTRUSTED"`. Misspellings fail at the Zod schema layer with a clear error.
- **`actor.principal` is also closed.** `"llm"` | `"user"` | `"system"`. The Pack's planner may treat these differently, but the envelope shape itself requires one of these three.
- **`nonce` is part of `intentHash`.** Two scenarios with the same `nonce` produce the same hash — fine for testing, but watch for accidental dedup if you reuse fixtures in audit-replay contexts.
- **`createdAt` is descriptive metadata, not part of the hash.** Omitting it is fine; the scenario loader defaults to "now."
- **`expected.kind` is the *Decision* kind, not the refusal code.** `"REFUSE"`, not `"taint_level_insufficient"`. Code-level assertions are out of scope for diff mode; if you need them, the programmatic test can inspect `decision.refusal.code`.
- **Diff mode discovers top-level `*.json` only.** No recursion, no `*.yaml`, no `*.adj.json`. Hidden files (`.dotfiles`) are skipped silently.

---

## Reference Packs

The framework's two reference Packs are the working examples — copy from them when scaffolding your own.

- [`@adjudicate/pack-payments-pix/scenarios/`](../../packages/pack-payments-pix/scenarios) — synchronous outcomes (EXECUTE / REFUSE / ESCALATE / REQUEST_CONFIRMATION / REWRITE) plus one DEFER.
- [`@adjudicate/pack-identity-kyc/scenarios/`](../../packages/pack-identity-kyc/scenarios) — async lifecycle (start → upload → vendor callback), AML escalation, and the system-only-kind taint defense.

For the CLI command reference, see [`packages/cli/README.md`](../../packages/cli/README.md).
