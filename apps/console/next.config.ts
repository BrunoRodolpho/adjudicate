import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are imported via TS path mapping (see tsconfig.json)
  // pointing directly at packages/*/src. Next must transpile these at runtime
  // since they aren't pre-built dist/ files when consumed via source paths.
  // This keeps "Go to Definition" landing in source while still letting the
  // dev/prod server execute the workspace TS.
  transpilePackages: ["@adjudicate/core", "@adjudicate/audit"],
  webpack: (config) => {
    // Path-aliased core/audit packages emit `.js` import suffixes in their
    // TS sources (ESM-emit compatibility). Without this mapping `next build`
    // tries to resolve `./envelope.js` against the `src/` tree literally
    // and fails. The alias lets webpack walk the same import as TypeScript
    // does under `moduleResolution: "bundler"` — a `.js` import resolves to
    // `.ts` first, then falls back to `.js`. Applies to client and server
    // bundles equally; the runtime files we ship are TS at the alias paths.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default config;
