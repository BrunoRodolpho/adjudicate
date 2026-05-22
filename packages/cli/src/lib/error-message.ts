/**
 * Internal CLI helper — uniform `unknown → string` for `catch (err)` blocks.
 *
 * Five separate CLI commands had grown identical local `asMessage()` helpers
 * (`replay.ts`, `repl.ts`, `export.ts`, `visualize.ts`, `scenarios-generate.ts`),
 * plus a few inline occurrences. This consolidates them so future CLI commands
 * don't paste a sixth copy.
 *
 * Not exported from the package; CLI commands import it directly. Kept inside
 * `packages/cli/src/lib/` rather than a shared workspace utility because
 * `@adjudicate/core` callers should rely on `err instanceof Error` directly —
 * adding this to the public API would be a sticky permanent surface.
 */

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
