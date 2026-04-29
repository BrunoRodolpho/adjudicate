/**
 * Phase 4 verification — exercises the multi-Pack Console registry
 * against the PIX regression test and the KYC integration test
 * defined in the spec's Definition of Done.
 *
 * Run with:
 *   cd apps/console && pnpm tsx scripts/verify-phase4.ts
 *
 * This deliberately avoids the Next.js dev server (which has a
 * pre-existing client-bundle breakage involving `node:crypto` in
 * `packages/core/src/hash.ts`, unrelated to Phase 4). It directly
 * invokes the same `ReplayInvoker` the tRPC route handler uses, so
 * it proves the production replay path end-to-end through the new
 * `PackRegistry`.
 */

import { kycStartDefer, pixRefundExecute } from "../src/lib/mocks/index.js";
import { createReferenceReplayInvoker } from "../src/lib/replay-invoker.js";
import { PackMetadataRegistry } from "../src/lib/packs/metadata.js";
import { PackRegistry } from "../src/lib/packs/registry.js";

async function main() {
  let failed = 0;

  function assert(cond: unknown, msg: string) {
    if (cond) {
      console.log(`  ✓ ${msg}`);
    } else {
      console.error(`  ✗ ${msg}`);
      failed += 1;
    }
  }

  console.log("\n— Registry alignment —");
  assert(
    PackMetadataRegistry.all().length === PackRegistry.all().length,
    "metadata count matches adapter count",
  );
  for (const m of PackMetadataRegistry.all()) {
    const a = PackRegistry.match(m.intents[0] ?? "");
    assert(
      a !== null && a.pack.id === m.id,
      `intent "${m.intents[0]}" routes to adapter "${m.id}"`,
    );
  }

  const invoker = createReferenceReplayInvoker();

  console.log("\n— PIX regression test —");
  const pixResult = await invoker.replay(pixRefundExecute);
  assert(
    pixResult.stateSource === "synthetic",
    "PIX replay reports synthetic state",
  );
  assert(
    pixResult.decision.kind === pixRefundExecute.decision.kind,
    `PIX decision matches original (${pixResult.decision.kind})`,
  );

  console.log("\n— KYC integration test —");
  console.log(`  intent kind: ${kycStartDefer.envelope.kind}`);
  const kycMeta = PackMetadataRegistry.match(kycStartDefer.envelope.kind);
  assert(
    kycMeta?.id === "pack-identity-kyc",
    "kyc.start metadata resolves to Identity KYC pack",
  );
  assert(
    kycMeta?.displayName === "Identity KYC",
    "displayName surfaces 'Identity KYC' for the Replay header",
  );

  const kycResult = await invoker.replay(kycStartDefer);
  assert(
    kycResult.stateSource === "synthetic",
    "KYC replay reports synthetic state",
  );
  assert(
    kycResult.decision.kind === "DEFER",
    `KYC kyc.start replay produces DEFER (got: ${kycResult.decision.kind})`,
  );
  if (kycResult.decision.kind === "DEFER") {
    assert(
      kycResult.decision.signal === "kyc.documents.uploaded",
      `DEFER signal is kyc.documents.uploaded (got: ${kycResult.decision.signal})`,
    );
  }

  console.log("\n— Unknown-intent rejection —");
  try {
    await invoker.replay({
      ...pixRefundExecute,
      envelope: { ...pixRefundExecute.envelope, kind: "unknown.intent" as never },
    });
    assert(false, "unknown intent kind throws REPLAY_NO_POLICY");
  } catch (err) {
    const e = err as { code?: string };
    assert(
      e.code === "REPLAY_NO_POLICY",
      `unknown intent kind throws REPLAY_NO_POLICY (got: ${e.code})`,
    );
  }

  console.log(failed === 0 ? "\n✓ all checks passed\n" : `\n✗ ${failed} check(s) failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
