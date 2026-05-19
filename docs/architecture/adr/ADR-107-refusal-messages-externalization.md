# ADR-107 — RefusalMessages externalization

**Status**: Accepted (2026-05-18 — M1 overnight execution)
**Supersedes**: none
**Related**: ADR-101 (kernel audit emission), ADR-106 (guard exception isolation)

## Context

Pre-M1, `@adjudicate/core`'s kernel hard-coded user-facing refusal
strings in Brazilian Portuguese (pt-BR):

```ts
refuse(
  "SECURITY",
  "kill_switch_active",
  "Sistema temporariamente indisponível.", // user-facing PT-BR
  ...
)
```

This was an artifact of the framework's extraction from IbateXas, a
Brazilian commerce platform. Eight such strings appeared across
`packages/core/src/kernel/{adjudicate,adjudicate-and-audit,
adjudicate-with-deadline,shadow}.ts`. Two problems:

1. **Locale-bound kernel** — adopters in non-Brazilian markets see
   `Sistema temporariamente indisponível` ship from a framework they
   install. Adoption friction.

2. **Architectural confusion** — the kernel's job is to produce a
   *stable, deterministic Decision*. User-facing strings are a
   *presentation* concern. Mixing them violates layering: the kernel
   decides; the UI decides how to render.

Per ADR-105's closed-vocabulary discipline, the right unit of stability
is the `code` field, not the `userFacing` string. The string is
guidance; the code is contract.

## Decision

1. **`RefusalMessages` interface in `@adjudicate/core`** — a per-code
   mapping with a `fallback`:

   ```ts
   interface RefusalMessages {
     readonly fallback: string;
     readonly byCode: Readonly<Record<string, string>>;
   }
   ```

2. **`englishRefusalMessages`** — framework-supplied English defaults
   for every kernel-emitted code (`kill_switch_active`,
   `schema_version_unsupported`, `taint_level_insufficient`,
   `default_deny`, `guard_panic`, `ledger_replay_suppressed`,
   `kernel_deadline_exceeded`).

3. **Kernel inline strings replaced with the English equivalent.** The
   kernel now emits English `userFacing` strings; the prior pt-BR
   strings live in a separate package.

4. **`localizeDecision(decision, messages)`** — pure helper in
   `@adjudicate/core`. Returns a Decision with `userFacing` swapped
   per the mapping. Non-REFUSE decisions pass through unchanged. Use
   at presentation/UI time.

5. **`@adjudicate/locales-pt-BR`** — new package exporting
   `portugueseRefusalMessages` with the original pt-BR strings.
   Adopters opt in via:

   ```ts
   import { localizeDecision } from "@adjudicate/core";
   import { portugueseRefusalMessages } from "@adjudicate/locales-pt-BR";
   const userVisible = localizeDecision(decision, portugueseRefusalMessages);
   ```

6. **The kernel does NOT consult `RuntimeContext` for the locale.**
   That would either (a) require an extra parameter to `adjudicate()`
   (breaks the pure signature) or (b) read from mutable global state
   (violates Invariant #1: kernel determinism). Localization is
   presentation-time only.

## Consequences

### Positive

- Kernel surface clean: zero locale-bound strings in `packages/core/src/`.
- New locales ship as standalone packages without kernel changes —
  Spanish, French, etc. follow the same pattern.
- Audit records carry the framework-default English string for
  governance consistency across regions. Operators in different
  geographies see the same governance trail; users see localized strings.
- Pack authors who emit Pack-specific refusal codes extend the
  dictionary by composition:
  ```ts
  const myMessages: RefusalMessages = {
    fallback: portugueseRefusalMessages.fallback,
    byCode: { ...portugueseRefusalMessages.byCode, "pack.specific": "..." },
  };
  ```

### Negative

- **Behavioral change for current adopters.** Default `userFacing`
  strings change from pt-BR to English in v0.2. Documented in
  CHANGELOG. Adopters wanting pt-BR add a 1-line import + a
  `localizeDecision` call at their render boundary. The cost is small
  but real.
- Audit records produced post-v0.2 differ from pre-v0.2 in the
  `userFacing` field. The `code` field is unchanged, so replay
  classification (`category:code` flat-set) is unaffected.

### Neutral

- The `RefusalMessages` shape is now public API. The closed-vocabulary
  discipline (rule 1, ADR-105) does NOT apply — adopters extend the
  `byCode` map freely with their own codes; only the kernel's
  *built-in* codes have stable English defaults.

## Alternatives considered

### Keep pt-BR as default; ship `@adjudicate/locales-en-US`

Rejected. The framework's npm-published name is English
(`@adjudicate`), the documentation is English, the test suite is
English, and the audience the framework is targeting is global.
Shipping pt-BR as the framework default puts adopters in non-Brazilian
markets in a position where the FRAMEWORK speaks their second language.
Discomfort scales linearly with adoption.

### Inject locale via RuntimeContext

Considered. Rejected because the kernel itself is pure — it cannot
consult mutable state without violating Invariant #1. Even if we
restrict the read to "first call only," we leak the singleton-mutable
pattern, which has historically led to test-flake and ordering bugs.

### Embed all locales in the kernel as a switch statement

Rejected. Forces all locales' string tables into the kernel bundle.
Adopters who only need English pay for Korean, Russian, Arabic. The
discriminated-union-vs-bag pattern: separate packages keep the kernel
small.

### Use ICU MessageFormat / formatjs

Rejected for v0.2. The kernel-emitted strings are short, static, and
don't need ICU's complexity (plurals, gender, dates). Pack authors who
need ICU can apply it themselves over the resolved string. v1.0+ may
revisit if multiple Pack authors need richer formatting.

## Migration path

- v0.2 ships the externalization with English as the default.
- CHANGELOG entry includes the 1-line migration snippet for pt-BR
  adopters.
- No deprecation window needed for the kernel inline strings (they
  were never API surface — only the `Refusal.userFacing` field was).
- Audit-postgres schema is unchanged. Stored historical records keep
  whatever string was emitted at the time.

## References

- Implementation: `packages/core/src/refusal-messages.ts`,
  `packages/locales-pt-BR/src/index.ts`.
- Pre-M1 strings: `git log --all -S 'Sistema temporariamente'`.
- Comparable model: Linux kernel string IDs paired with
  userspace-supplied translation tables (CONFIG_NLS_*).
