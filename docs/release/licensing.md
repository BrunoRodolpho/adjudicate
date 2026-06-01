# Dependency licensing notes

## Published packages (`@adjudicate/*`)

All published packages (`@adjudicate/core`, `@adjudicate/audit`, `@adjudicate/adapter-core`,
`@adjudicate/anthropic`, `@adjudicate/openai`, `@adjudicate/admin-sdk`, etc.) depend exclusively
on MIT, Apache-2.0, BSD, or ISC licensed packages. Run the following to verify on each release:

```bash
pnpm licenses list -P --filter "@adjudicate/*"
```

No published package pulls GPL, LGPL, or MPL code.

## Apps and examples (`apps/*`, `examples/*`)

These are `private: true` and are never published to npm. They may include packages with
copyleft-adjacent licenses:

### LGPL-3.0-or-later: `@img/sharp-libvips-*`

Pulled transitively by `next` (image optimization) in `apps/console` and `apps/web`.
`sharp` loads libvips as a native addon and distributes the binary separately — standard
dynamic-linking boundary. No LGPL obligation applies to the framework or its adopters.

### MPL-2.0: `@mediabunny/*` (mediabunny, @mediabunny/aac-encoder, etc.)

Pulled by `@remotion/*` in `apps/web` (video rendering dev scripts). MPL-2.0 is
file-level copyleft — it does not affect the framework license. These packages are
dev-only and are never shipped in built artifacts.

## Adopter guidance

If you build a published package or app that depends on `@adjudicate/*`, you inherit only
MIT-compatible transitive deps from the kernel packages. If you copy or extend `apps/console`
or `apps/web` as a starting point, check the above LGPL/MPL notes against your own
distribution model.
