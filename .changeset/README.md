# Changesets

This directory holds "changesets" — short markdown files describing version bumps
and changelog notes for the `@adjudicate/*` packages. They drive automated
releases via [changesets](https://github.com/changesets/changesets).

## Adding a changeset

When you make a change worth a release:

```bash
pnpm changeset
```

You'll be prompted to:

1. Select the packages your change affects.
2. Choose `patch` / `minor` / `major` for each.
3. Write a changelog summary (1–3 sentences).

This creates a markdown file in `.changeset/`. Commit it with your PR.

## Cutting a release

When changesets are merged to `main`, the **Release** workflow opens (or updates)
a "Version Packages" PR that bumps versions and updates changelogs. Merging that
PR triggers `npm publish` for every changed package.

## Pre-release convention

The kernel packages have graduated from `0.1.0-experimental` to stable semver —
`@adjudicate/core` (1.x), `@adjudicate/conformance` (2.x), `@adjudicate/adapter-core`
and the re-exporters `@adjudicate/anthropic` / `@adjudicate/openai` /
`@adjudicate/vercel-ai` (0.3.x). Changesets now drives their versions with no manual
intervention: let the auto-generated **Version Packages** PR set the bump.

The only package still carrying the `-experimental` suffix is
`@adjudicate/pack-cli-agent` (`0.1.0-experimental`), a reference Pack whose
contract is intentionally not yet frozen. If a Version PR drops *its* suffix
before that Pack stabilises, edit the version field back before merging. No other
package needs suffix handling.
