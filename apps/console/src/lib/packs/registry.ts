import type { ConsolePackAdapter } from "./adapter";
import { kycAdapter } from "./definitions/kyc";
import { pixAdapter } from "./definitions/pix";
import { PackMetadataRegistry, type PackMetadata } from "./metadata";

/**
 * Server-side registry of installed Pack adapters.
 *
 * Why server-side only: each adapter pulls `installPack` from
 * `@adjudicate/core`, which webpack resolves through the path-aliased
 * source tree. That's the right behavior for the kernel and the
 * `ReplayInvoker` (we want runtime conformance checks to fire), but
 * it can't land in the client bundle without breaking module
 * resolution. UI components read `./metadata.ts` instead.
 *
 * Adding a Pack means appending to BOTH this `ADAPTERS` list AND the
 * `PACK_METADATA` table in `./metadata.ts`. The `assertRegistryAlignment`
 * call below fails fast on mismatch so the duplication can't drift
 * silently.
 */

const ADAPTERS: ReadonlyArray<ConsolePackAdapter> = [pixAdapter, kycAdapter];

function assertRegistryAlignment(): void {
  const metadata = PackMetadataRegistry.all();
  if (metadata.length !== ADAPTERS.length) {
    throw new Error(
      `PackRegistry mismatch: ${ADAPTERS.length} adapters but ${metadata.length} metadata entries. Update apps/console/src/lib/packs/metadata.ts.`,
    );
  }
  for (const adapter of ADAPTERS) {
    const meta = metadata.find((m) => m.id === adapter.pack.id);
    if (!meta) {
      throw new Error(
        `PackRegistry mismatch: adapter for "${adapter.pack.id}" has no metadata entry. Add it to apps/console/src/lib/packs/metadata.ts.`,
      );
    }
    assertSameIntents(meta, adapter);
  }
}

function assertSameIntents(
  meta: PackMetadata,
  adapter: ConsolePackAdapter,
): void {
  const a = [...meta.intents].sort();
  const b = [...adapter.pack.intents].sort();
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
    throw new Error(
      `PackRegistry mismatch: "${meta.id}" intents differ between metadata.ts (${a.join(",")}) and pack (${b.join(",")}).`,
    );
  }
}

assertRegistryAlignment();

function match(intentKind: string): ConsolePackAdapter | null {
  return (
    ADAPTERS.find((a) => a.pack.intents.includes(intentKind)) ?? null
  );
}

export const PackRegistry = {
  /** Resolve the adapter for a given intent kind, or null if unknown. */
  match,
  /** All registered adapters, in declaration order. */
  all(): ReadonlyArray<ConsolePackAdapter> {
    return ADAPTERS;
  },
} as const;
