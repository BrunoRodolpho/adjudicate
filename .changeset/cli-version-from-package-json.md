---
"@adjudicate/cli": patch
---

CLI derives its `--version` output from `package.json` at runtime instead of a hardcoded string, so the advertised version can never drift from the published package version.

Previously `bin.ts` hardcoded `.version("x.y.z")`. The changesets release flow bumps `package.json` but never touches source, so every CLI version bump left the literal stale and failed the release PR's version-consistency gate (both the `Version consistency` job and the `rc:check` chain). `bin.ts` now reads the version via `readFileSync(new URL("../package.json", import.meta.url))` (resolves identically from `dist/bin.js` and `src/bin.ts`), and `scripts/check-versions.ts` now forbids re-introducing a hardcoded `.version("…")` literal.
