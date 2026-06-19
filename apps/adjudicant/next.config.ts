import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Only the packages mapped to source in tsconfig.json (`@adjudicate/core`,
  // `@adjudicate/audit`) need runtime transpilation — Next must compile their
  // `.ts` since they're consumed via source paths. Every other `@adjudicate/*`
  // dependency resolves through its built `dist/` (already JS) and must NOT be
  // listed here. Mirrors apps/console and apps/adjutant.
  transpilePackages: ["@adjudicate/core", "@adjudicate/audit"],
  webpack: (config) => {
    // Path-aliased packages emit `.js` import suffixes in their TS sources
    // (ESM-emit compatibility). Without this mapping `next build` tries to
    // resolve `./envelope.js` against the `src/` tree literally and fails. The
    // alias lets webpack walk the same import as TypeScript does under
    // `moduleResolution: "bundler"` — a `.js` import resolves to `.ts` first,
    // then falls back to `.js`. Applies to client and server bundles equally;
    // the runtime files we ship are TS at the alias paths.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default config;
