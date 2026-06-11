# BASIS_CODES — vocabulary governance

`DecisionBasis` is vocabulary-controlled by construction. Every basis emitted at
runtime must carry a `category` from the closed `BasisCategory` union and a
`code` drawn from the per-category `BASIS_CODES` constant
(`src/basis-codes.ts`). This prevents semantic drift (`"scope_ok"` vs
`"scope_sufficient"` vs `"scope-valid"`) across audit records.

## Categories

`BasisCategory` is a closed union of 11 categories. The first seven are emitted
by policy evaluation; the last four are emitted by the kernel and the
`adjudicate*` entry points outside the policy bundle.

| category | emitted by | purpose |
|---|---|---|
| `state` | policy | State-machine transition legality |
| `auth` | policy | Caller identity and scope |
| `taint` | policy | Provenance trust check |
| `ledger` | policy | Replay and resource-version checks |
| `schema` | policy | Envelope version and payload shape |
| `business` | policy | Domain rule (satisfied / violated / capped) |
| `validation` | policy | Pre-commit content checks (forbidden phrases, normalization, PII per ADR-117, command-risk per ADR-123) |
| `kill` | kernel | Kill-switch active, or config-seal mismatch (ADR-121) — blocks every intent regardless of policy |
| `deadline` | `adjudicateWithDeadline` | Wall-clock budget exceeded before adjudication completed |
| `confirmation` | `adjudicateAndAudit` | Confirmation receipt substituted for a `REQUEST_CONFIRMATION` (preserves "asked → confirmed → allowed" in one record) |
| `kernel` | kernel | `guard_panic` (T-002: a guard threw and was converted to a SECURITY REFUSE) or kernel intent dispatch |

The authoritative code list per category is the `BASIS_CODES` const itself —
read it directly rather than duplicating it here.

## Using `basis()`

Always prefer the `basis()` helper over raw object literals. It gives you
compile-time enforcement that the `code` belongs to the chosen `category`.

```ts
import { basis, BASIS_CODES } from "@adjudicate/core";

// Compile-safe — code is narrowed to the category's known values.
const b = basis("auth", BASIS_CODES.auth.SCOPE_SUFFICIENT);

// Compile error — BASIS_CODES.state.TRANSITION_VALID is not an auth code.
const bad = basis("auth", BASIS_CODES.state.TRANSITION_VALID);
```

## Extending the vocabulary

The vocabulary is single-sourced in core. To add a code or category, edit the
`BASIS_CODES` const (and, for a new category, the `BasisCategory` union) in
`src/basis-codes.ts`. There is no adopter-side extension path:

- `BasisCodesMap` is a **type alias** (`type BasisCodesMap = typeof
  BASIS_CODES`), not an interface, so it cannot be augmented via `declare
  module`.
- Vocabulary purity is a **runtime** invariant. `isKnownBasisCode` and the
  "basis vocabulary purity" property test (`tests/kernel/invariants/`,
  mirrored in `@adjudicate/conformance`) validate `basis.code` against the
  runtime `BASIS_CODES` object. A type-only declaration registers nothing at
  runtime and would fail the invariant.

Domain-specific bases therefore live under the existing `business` /
`validation` categories using codes added to the const, not under adopter-local
strings or types.

## What NOT to do

- **Do not** emit `basis.code` as a dynamically-constructed string. The
  "basis vocabulary purity" invariant fails loudly if a runtime code does
  not belong to `BASIS_CODES[category]`.
- **Do not** place business codes under `validation` or vice versa. Category
  meaning is part of the audit contract.
