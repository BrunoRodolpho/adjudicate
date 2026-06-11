# @adjudicate/cli

> **Status: `0.3.0`** — Pack lifecycle and verification commands for policy authors.

The framework CLI for **authoring, verifying, and exercising** Packs, complementing the operator Console for **running** them.

```bash
# Scaffold a new Pack — auto-detects monorepo vs standalone
adjudicate pack init pack-my-domain

# Validate a Pack against the kernel's conformance contract
adjudicate pack lint ./packages/pack-my-domain

# Run a single envelope against a Pack's policy
adjudicate simulate --pack ./dist/index.js --scenario refund-medium.json

# Run a directory of scenarios; exit 2 on any policy regression
adjudicate simulate --pack ./dist/index.js --scenarios ./scenarios

# Verify the local environment
adjudicate doctor
```

---

## Command surface

Run `adjudicate <command> --help` for the authoritative flag list. The full inventory:

| Command | Purpose |
|---|---|
| `pack init <name>` | Scaffold a new Pack from a domain template |
| `pack lint [path]` | Validate a Pack against kernel conformance |
| `pack bom <path>` | Emit an AI Bill-of-Materials (AI-BOM) for a Pack (ADR-127) |
| `pack verify [path]` | Verify a Pack's trust posture (fingerprint + optional signature) |
| `simulate` | Run envelopes against a Pack's policy and render Decisions |
| `analyze` | Run `@adjudicate/analyze` Tier 1 static analysis against a Pack |
| `red-team` | Generate adversarial scenarios and assert kernel-level defenses hold |
| `scenarios generate` | Generate scenario JSON fixtures from a Pack's intents (seeded) |
| `replay` | Re-adjudicate stored AuditRecords against a Pack and report divergence |
| `repl` | Interactive intent → decision shell (no audit sink) |
| `visualize` | Render a Pack's PolicyBundle as a standalone HTML/SVG policy graph |
| `export` | Export audit records (JSONL) to JSON or CSV (Parquet deferred to v0.6) |
| `reap` | Scan the Idle-DeferStore (Redis) for `defer:pending:*` keys and report TTL |
| `dev` | Spin up a local Docker Compose harness (Redis + Postgres) |
| `doctor` | Verify the local environment |

The sections below document the core authoring loop in detail.

---

## Commands

### `adjudicate pack init <name>`

Scaffolds a new Pack with the canonical file layout:

```
<name>/
├── package.json          — typed exports + workspace deps; `test:scenarios` script
├── tsconfig.json         — extends base in monorepo, self-contained otherwise
├── src/
│   ├── index.ts          — Pack export with `as const satisfies PackV0<...>`
│   └── policy.ts         — PolicyBundle, guards, CapabilityPlanner, taint policy
├── scenarios/
│   └── example-execute.json   — sample fixture exercising the default policy
└── tests/
    └── conformance.test.ts    — runs assertPackConformance on the Pack
```

The scaffolded Pack passes `assertPackConformance` immediately. Run `pnpm test` to verify, `pnpm build && pnpm test:scenarios` to walk the sample fixture.

**Templates** (`--template <name>`, default `basic`). `basic` is the minimal hello-world Pack; the domain templates ship richer guard patterns (REWRITE / ESCALATE / DEFER / REQUEST_CONFIRMATION) keyed off the domain shape. Available templates:

| Template | Domain shape |
|---|---|
| `basic` | Minimal hello-world Pack (default) |
| `payment` | Payment charge/refund with confirmation thresholds |
| `approval` | Human-in-the-loop approval gating |
| `kyc` | Async identity verification with DEFER lifecycle |
| `deployment` | Deployment/release gating |

Each template lives under `packages/cli/templates/<name>/`.

**Detection model:** if a `pnpm-workspace.yaml` declaring `packages/*` is found walking up from cwd, scaffolds under `<workspace-root>/packages/<name>`. Otherwise scaffolds under `<cwd>/<name>`. Override the parent directory with `--target <dir>`.

### `adjudicate pack lint [path]`

Validates a Pack at the given path (defaults to cwd) against the kernel's canonical conformance contract — `assertPackConformance` from `@adjudicate/core`. The CLI does not reimplement the rules; it asks the kernel.

Surfaces:
- `✓` when the Pack passes
- `✗` with the specific kernel-reported violation when it fails

### `adjudicate simulate`

Run envelopes against a Pack's policy and render the resulting Decision(s).

**Three input modes** (exactly one is required):

| Mode | Flags | When |
|---|---|---|
| **Single bundled** | `--scenario <file>` | Quick one-shot: intent + state + expected in one JSON file |
| **Single from pair** | `--intent <file> --state <file>` | Many fixtures sharing the same state — reuse the state file |
| **Diff (directory)** | `--scenarios <dir>` | CI: walk all `*.json`, summarize, exit non-zero on mismatches |

**Pack resolution.** `--pack <module>` accepts anything `import()` accepts:

```bash
--pack @adjudicate/pack-payments-pix         # npm package name (workspace symlinks work)
--pack ./packs/my-pack/dist/index.js         # relative path
--pack /abs/path/to/pack/dist/index.js       # absolute path
```

Bare specifiers go through Node's module resolution; paths become `file://` URLs.

**Output formats** (`--format text|json`, default `text`):

- `text` — fixed-width rounded-box rendering with section headers (Intent / Trace / Basis / Detail). Width clamped to `[70, 120]`, color via chalk (auto-disabled under `NO_COLOR=1` or non-TTY).
- `json` — full `{ pack, envelope, decision, trace, expected? }` payload. Stable shape; safe to pipe.

**Exit codes** (diff mode):

| Exit | When |
|---|---|
| `0` | No mismatches, no errors |
| `2` | One or more `decision.kind !== expected.kind` (policy regression) |
| `1` | One or more scenario load errors (no mismatches) |

Mismatch beats error — a policy regression is more actionable than a malformed scenario file.

### `adjudicate doctor`

Verifies the local environment:

- Node version ≥ 20
- Workspace shape (`monorepo` vs `standalone`, detected via pnpm-workspace.yaml)
- `@adjudicate/core` is built (`dist/` exists for workspace resolution)

Exits `1` if any check fails; warnings (e.g. standalone mode) are non-fatal.

---

## Scenario format

A scenario is a JSON file with `intent` + `state` + an optional `expected` decision kind:

```jsonc
{
  "intent": {
    "kind": "pix.charge.refund",
    "payload": {
      "chargeId": "c-1",
      "refundCentavos": 60000,
      "reason": "customer_request"
    },
    "actor":  { "principal": "llm", "sessionId": "sess-1" },
    "taint":  "UNTRUSTED",
    "nonce":  "n-1"
  },
  "state": {
    "charges": {
      "c-1": { "id": "c-1", "amountCentavos": 100000, "status": "confirmed" }
    }
  },
  "expected": { "kind": "REQUEST_CONFIRMATION" }   // optional; used by diff mode
}
```

Fields:
- `intent` — the user-supplied envelope shape (`kind`, `payload`, `actor`, `taint`, `nonce`, optional `createdAt`). The CLI passes these through `buildEnvelope` to compute `version` + `intentHash`.
- `state` — plain JSON. The Pack's `rehydrateState` (if exported) converts to runtime shapes (e.g., `Map<id, Charge>`) before the kernel reads it.
- `expected.kind` — optional. When present in diff mode, drives the match/mismatch verdict.

Schema-validated via Zod. Malformed fields produce a `ScenarioParseError` with a bullet list of issues and the source path.

---

## Output: text mode example

```
╭─ DECISION: REQUEST_CONFIRMATION ─────────────────────────────────────────────╮
│ Pack       pack-payments-pix                                                 │
│ Kind       pix.charge.refund                                                 │
│ Actor      llm/sess-1                                                        │
│ Taint      UNTRUSTED                                                         │
│ Nonce      n-1                                                               │
│ Hash       460891c47222...                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Trace                                                                        │
│   kill                                                                pass   │
│   schema                                                              pass   │
│   state[0]     escalateFailedConfirm                                  pass   │
│   ...                                                                        │
│   business[3]  requestConfirmForMediumRefund                          MATCH  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Basis                                                                        │
│   schema     / version_supported                                             │
│   ...                                                                        │
│   business   / rule_satisfied                                                │
│                rule:      confirm_threshold_reached                          │
│                threshold: 50000                                              │
│                requested: 60000                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Prompt                                                                       │
│   You're about to refund R$ 600.00. Confirm?                                 │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Output: diff mode summary

```
pack: pack-payments-pix

✓ 01-refund-execute               EXECUTE               (expected EXECUTE)
✗ 02-refund-mismatch              ESCALATE              (expected REFUSE)
○ 03-refund-advisory              REQUEST_CONFIRMATION  (no expected)
! 04-broken                       ERROR                 Failed to parse JSON: ...

1 matched · 1 changed · 1 advisory · 1 error
```

| Marker | Status | Meaning |
|---|---|---|
| `✓` | match | `decision.kind === expected.kind` |
| `✗` | mismatch | `decision.kind !== expected.kind` |
| `○` | advisory | Scenario has no `expected`; informational |
| `!` | error | Scenario failed to load |

---

## Pre-requisites

- **Node ≥ 20**
- **`pnpm install` + `pnpm build`** in the workspace before using `pack lint` or `simulate` (both dynamic-import the Pack, which transitively requires `@adjudicate/core/dist/`).

---

## Further reading

- [**Test your policy** guide](../../docs/guides/testing-your-policy.md) — the end-to-end walkthrough: how to write scenarios, wire them into CI, and what changes when a policy moves.
- The lighthouse Pack [`@adjudicate/pack-payments-pix/scenarios/`](../pack-payments-pix/scenarios) — six scenarios, one per Decision outcome, used as the reference example.
- The async Pack [`@adjudicate/pack-identity-kyc/scenarios/`](../pack-identity-kyc/scenarios) — DEFER lifecycle, AML branch, and the system-only-kind taint defense.
