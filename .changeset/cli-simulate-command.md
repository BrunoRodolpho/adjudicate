---
"@adjudicate/cli": minor
"@adjudicate/core": minor
"@adjudicate/pack-payments-pix": minor
"@adjudicate/pack-identity-kyc": minor
---

Phase 6.2 — `adjudicate simulate` command + state rehydration convention.

## `@adjudicate/cli` — new `simulate` subcommand

Run a single envelope against a Pack's policy and render the resulting Decision + per-guard evaluation trace.

```sh
adjudicate simulate --pack @adjudicate/pack-payments-pix --scenario refund-medium.json
adjudicate simulate --pack ./packs/my-pack/src/index.ts --intent intent.json --state state.json --format json
```

- `--pack <module>` accepts any Node import specifier: npm package name (workspace symlinks work) or relative/absolute path (converted to `file://`).
- `--scenario <file>` reads a bundled JSON with `intent` + `state` + optional `expected`.
- `--intent <file> --state <file>` reads them separately — useful when many fixtures share state.
- `--format text|json` selects output. Text is a minimal line-oriented placeholder; the full ANSI-boxed renderer lands in Phase 6.3.
- When the scenario carries `expected.kind` and the decision doesn't match, exit code is 2. Otherwise exit 0.

Scenario schema is Zod-validated; malformed JSON or unknown enum values produce a structured `ScenarioParseError` with a bullet list of issues + the source path.

New programmatic exports from `@adjudicate/cli`:
- `runSimulate`, `SimulateOptions`
- `loadScenario`, `loadIntentAndState`, `ScenarioParseError`, `Scenario`, `IntentInput`
- `loadPackFromModule`, `findPackExport`, `isLikelyPack` (shared with `pack lint`)
- `renderSimulation`, `SimulationOutput`, `SimulationFormat`

Internal refactor: the Pack-discovery helpers (`findPackExport`, `isLikelyPack`) moved from `pack-lint.ts` into a new `lib/pack-loader.ts` so `simulate` and `lint` share one definition of "what counts as a Pack export."

New dependency: `zod ^4.3.6` for scenario validation.

## `@adjudicate/core` — `PackV0.rehydrateState`

PackV0 gains an optional `rehydrateState?: (raw: unknown) => State`. Tools that source state from JSON (CLI `simulate`, future Console scenario builder, future audit-replay payload restoration) call this to convert from a serializable representation (typically `JSON.parse` output) back into the runtime state shape — needed when state contains `Map`/`Set`/`Date`/etc. that don't survive `JSON.stringify` round-tripping.

Optional and backward-compatible — Packs with state that's already plain JSON (records, arrays, primitives) omit it.

## `@adjudicate/pack-payments-pix` — `rehydratePixState`

Exports a new `rehydratePixState(raw)` function (also wired as `paymentsPixPack.rehydrateState`) that converts `{ charges: { [id]: PixCharge } }` from JSON into `PixState` with the runtime `Map<string, PixCharge>`. Idempotent on already-rehydrated input.

## `@adjudicate/pack-identity-kyc` — `rehydrateKycState`

Exports a new `rehydrateKycState(raw)` function (wired as `IdentityKycPack.rehydrateState`) that converts `{ sessions: { [id]: KycSession } }` into the runtime `Map<string, KycSession>` shape.

## Verification

- 8 new `simulate` integration tests cover all six PIX outcomes (EXECUTE, REQUEST_CONFIRMATION, ESCALATE, DEFER, REWRITE) plus KYC DEFER and the system-only-kind taint refusal.
- 10 new scenario-schema tests cover valid input, structured Zod errors, missing fields, extra keys, and malformed JSON.
- All existing tests remain green: core 253/253, PIX 28/28, KYC 14/14, primitives 13/13.
