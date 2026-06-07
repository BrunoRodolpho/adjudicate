# @adjudicate/red-team

Deterministic adversarial scenario generation for adjudicate Packs. Synthesizes
attack scenarios from a Pack's declared surface, runs them through the **pure
kernel**, and asserts the policy's defenses hold — no clean `EXECUTE` escapes.

## Vectors

| Generator | Probes | Defense |
|---|---|---|
| `generatePromptInjectionEnvelopes` | injection strings in UNTRUSTED/LLM payloads, per intent kind | any non-EXECUTE outcome |
| `generateTaintEscalationEnvelopes` | system-only kinds proposed at UNTRUSTED (below the declared minimum) | must `REFUSE` (taint gate) |
| `generateToolScopeViolationEnvelopes` | intents the planner does not offer for the empty state | any non-EXECUTE outcome |

```ts
import {
  generateAllVectors,
  runRedTeam,
  computeRedTeamExitCode,
  renderRedTeamText,
} from "@adjudicate/red-team";

const scenarios = generateAllVectors(pack, { seed: 0xED7EA, perIntent: 3 });
const report = runRedTeam(pack, scenarios);
console.log(renderRedTeamText(report));
process.exit(computeRedTeamExitCode(report.summary)); // 2 on any escape/error
```

Or via the CLI: `adjudicate red-team --pack <module>`.

## Determinism & scope

- Same `seed` → byte-identical `RedTeamScenario[]`. The kernel call is pure; no
  clock/RNG/I/O on the assertion path. No new basis codes or kernel changes — a
  consumer of the existing taint/auth/business vocabulary.
- **"Defended" means "did not reach a clean EXECUTE under these
  structurally-derived inputs"** — not a proof of total safety. Payloads are
  generic (no per-Pack schema introspection), so red-team complements, not
  replaces, schema-aware Pack-authored fixtures.
- Tool-scope enforcement is a *bridge* concern; this vector asserts only that the
  *policy* does not blindly EXECUTE an out-of-plan intent.
