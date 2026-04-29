/**
 * Client-safe Pack metadata.
 *
 * The full Pack adapters (`./registry.ts` + `./definitions/*.ts`) pull
 * in the kernel via `installPack`, which is fine for the server-side
 * `ReplayInvoker` but pulls a path-aliased `@adjudicate/core` source
 * tree into the client bundle if a client component imports them.
 * That tree uses `.js` import suffixes against `.ts` source files —
 * webpack chokes on the unresolved extensions.
 *
 * This module is the deliberate client cut: pure metadata, no kernel
 * imports, safe to embed in `columns.tsx` and `ReplayDialog.tsx`. Both
 * the server registry and this metadata table list every Pack — a
 * boot-time conformance check in `./registry.ts` asserts the two
 * stay in sync, so adding a Pack is two coordinated entries with
 * mismatch surfaced loudly rather than silently.
 */

export interface PackMetadata {
  /** Machine-readable Pack id (e.g., `pack-payments-pix`). */
  readonly id: string;
  /** Pack version, displayed in the Replay header chip. */
  readonly version: string;
  /** Human-readable label for UI surfaces. */
  readonly displayName: string;
  /** Intent kinds this Pack handles. */
  readonly intents: ReadonlyArray<string>;
}

const PACK_METADATA: ReadonlyArray<PackMetadata> = [
  {
    id: "pack-payments-pix",
    version: "0.1.0-experimental",
    displayName: "Payments PIX",
    intents: [
      "pix.charge.create",
      "pix.charge.confirm",
      "pix.charge.refund",
    ],
  },
  {
    id: "pack-identity-kyc",
    version: "0.1.0-experimental",
    displayName: "Identity KYC",
    intents: ["kyc.start", "kyc.document.upload", "kyc.vendor.callback"],
  },
];

function match(intentKind: string): PackMetadata | null {
  return (
    PACK_METADATA.find((p) => p.intents.includes(intentKind)) ?? null
  );
}

export const PackMetadataRegistry = {
  /** Resolve metadata for a given intent kind, or null if unregistered. */
  match,
  /** All registered Packs, in declaration order. */
  all(): ReadonlyArray<PackMetadata> {
    return PACK_METADATA;
  },
} as const;
