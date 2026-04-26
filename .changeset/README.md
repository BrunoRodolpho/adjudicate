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

## Pre-release convention (Phase 1 → Phase 3)

The four kernel packages live at `0.1.0-experimental` until Phase 3 of the
[platform roadmap](../README.md#status) validates the Pack contract. Until then,
the `-experimental` suffix is preserved manually in any version bump — when the
auto-generated Version PR drops the suffix, edit the version field back before
merging. After Phase 3, the suffix drops on first stable release and changesets
takes over without intervention.
