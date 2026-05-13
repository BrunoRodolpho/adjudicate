---
"@adjudicate/cli": minor
---

Phase 6.4 — `adjudicate simulate --scenarios <dir>` diff mode.

Walk a directory of `*.json` scenario fixtures, run each against the supplied Pack, and render a summary table comparing each `decision.kind` to the scenario's `expected.kind`.

```sh
adjudicate simulate --pack @adjudicate/pack-payments-pix --scenarios ./scenarios
adjudicate simulate --pack ./packs/my-pack/src/index.ts --scenarios ./scenarios --format json
```

Sample text output:
```
pack: pack-payments-pix

✓ 01-execute            EXECUTE               (expected EXECUTE)
✗ 02-escalate           ESCALATE              (expected REFUSE)
○ 03-advisory           REQUEST_CONFIRMATION  (no expected)
! 04-broken             ERROR                 Failed to parse JSON ...

1 matched · 1 changed · 1 advisory · 1 error
```

## Per-scenario outcomes

| Marker | Status | Meaning |
|---|---|---|
| `✓` (green) | `match` | `decision.kind === expected.kind` |
| `✗` (red) | `mismatch` | `decision.kind !== expected.kind` |
| `○` (dim) | `advisory` | Scenario has no `expected`; reported for visibility |
| `!` (yellow) | `error` | Scenario failed to load (malformed JSON, schema error, …) |

## Exit code policy

| Exit | When |
|---|---|
| 0 | No mismatches, no errors |
| 2 | One or more mismatches (mismatch wins over errors — policy regression is the more actionable signal) |
| 1 | One or more errors and zero mismatches |

Mirrors the single-scenario mode's `exit 2 on expected mismatch` contract.

## File discovery

- Top-level `*.json` files only (no recursion).
- Hidden files (`.foo.json`) and non-JSON entries skipped silently.
- Sorted alphabetically by basename for stable output across runs.

## JSON format

```json
{
  "pack": { "id": "pack-payments-pix" },
  "summary": { "total": 4, "matched": 1, "changed": 1, "advisory": 1, "errors": 1 },
  "results": [
    { "scenario": "01-execute", "status": "match", "decision": "EXECUTE", "expected": "EXECUTE" },
    { "scenario": "02-escalate", "status": "mismatch", "decision": "ESCALATE", "expected": "REFUSE" },
    { "scenario": "03-advisory", "status": "advisory", "decision": "REQUEST_CONFIRMATION" },
    { "scenario": "04-broken", "status": "error", "error": "..." }
  ]
}
```

Stable shape; safe to pipe into other tools or check into a snapshot file.

## Mode selection (mutually exclusive)

The `simulate` command now accepts exactly one of three input modes:
- `--scenarios <dir>` — diff mode (new in 6.4)
- `--scenario <file>` — single bundled (6.2)
- `--intent <file> --state <file>` — single from pair (6.2)

Passing more than one (or none) produces a clear error and exits 1.

## New programmatic exports from `@adjudicate/cli`

- `listScenarios(dir)` — directory walker (sorted, filtered, non-recursive)
- `runDiff(pack, scenarioPaths)` — orchestration; returns `DiffReport`
- `renderDiffText(report, pack)`, `renderDiffJson(report, pack)` — renderers
- `computeExitCode(summary)` — exit-code policy in a single place
- Types: `DiffReport`, `DiffSummary`, `ScenarioResult`, `ScenarioStatus`

## Verification

10 new tests cover: walker correctness (sort/skip-hidden/skip-non-json/empty-dir), `runDiff` outcome classification (match/mismatch/advisory/error), exit-code policy (every combination), and end-to-end command integration (text + JSON output, exit-on-mismatch, mode-selection validation).

All prior CLI tests pass (38 → 48). Core 253/253, PIX 28/28, KYC 14/14, primitives 13/13 unchanged.
