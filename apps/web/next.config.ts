import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@adjudicate/core",
    "@adjudicate/audit",
    "@adjudicate/primitives",
    "@adjudicate/pack-payments-pix",
    "@adjudicate/pack-identity-kyc",
    "@adjudicate/pack-deployments-approval",
  ],
  webpack: (config) => {
    // Path-aliased workspace packages emit `.js` import suffixes in their
    // TS sources (ESM-emit compatibility). The alias lets webpack walk the
    // same import as TypeScript does under `moduleResolution: "bundler"`.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default config;
