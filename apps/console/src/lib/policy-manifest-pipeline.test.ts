/**
 * End-to-end proof of the policy-manifest pipeline that feeds the rule tree:
 *   describeInstalledPacks (@adjudicate/analyze) → PolicyManifestSchema
 *   (@adjudicate/admin-sdk wire) → diffManifests (client drift).
 *
 * Run against adjudicate's real shipped Packs — the exact data the console
 * route handler computes live and threads into `governance.policyManifest`.
 */

import { describe, expect, it } from "vitest";
import { describeInstalledPacks, type PolicyManifest } from "@adjudicate/analyze";
import { PolicyManifestSchema, type PolicyManifestParsed } from "@adjudicate/admin-sdk";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import { IdentityKycPack } from "@adjudicate/pack-identity-kyc";
import { deploymentsApprovalPack } from "@adjudicate/pack-deployments-approval";
import { diffManifests, removedNodes } from "./manifest-diff";

const manifest: PolicyManifest = describeInstalledPacks(
  [paymentsPixPack, IdentityKycPack, deploymentsApprovalPack] as unknown as Parameters<
    typeof describeInstalledPacks
  >[0],
  { adopter: "adjudicate (shipped packs)" },
);

describe("policy-manifest pipeline", () => {
  it("the live manifest validates against the admin-sdk wire schema", () => {
    const parsed = PolicyManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      throw new Error(`schema rejected live manifest:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
    }
    expect(parsed.success).toBe(true);
  });

  it("describes all three shipped packs with intents, guards, and a sha256 digest", () => {
    expect(manifest.packs.length).toBe(3);
    for (const p of manifest.packs) {
      expect(p.intents.length).toBeGreaterThan(0);
      expect(p.guards.length).toBeGreaterThan(0);
      for (const i of p.intents) {
        expect(["SYSTEM", "TRUSTED", "UNTRUSTED", "unknown"]).toContain(i.taintFloor);
        // Every intent can at least reach the policy default.
        expect(i.outcomes.possible).toContain(i.default);
      }
    }
    expect(manifest.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("guards resolve a real name (no positional fallback in shipped packs)", () => {
    const positional = manifest.packs
      .flatMap((p) => p.guards)
      .filter((g) => g.nameSource === "positional");
    expect(positional).toEqual([]);
  });
});

describe("diffManifests", () => {
  const parsed: PolicyManifestParsed = PolicyManifestSchema.parse(manifest);

  it("reports identical for the same manifest", () => {
    const d = diffManifests(parsed, parsed);
    expect(d.identical).toBe(true);
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it("detects a removed pack AND surfaces its child guards as removed", () => {
    const fewer: PolicyManifestParsed = { ...parsed, packs: parsed.packs.slice(1) };
    const d = diffManifests(parsed, fewer);
    expect(d.identical).toBe(false);
    expect(d.counts.removed).toBeGreaterThan(0);
    expect(d.packStatus.get(parsed.packs[0]!.id)).toBe("removed");
    // P2 fix: a removed pack's children are enumerated (not invisible) so the
    // drift panel can list which guards disappeared.
    const removed = removedNodes(d);
    expect(removed.packs).toContain(parsed.packs[0]!.id);
    expect(removed.guards.length).toBeGreaterThan(0);
  });

  it("ignores sourceLocation — baseline-with-source vs live-without-source is NOT drift", () => {
    // The documented workflow: committed `ibx policy export` baseline carries
    // sourceLocation; the console's live manifest does not. That must diff clean.
    const withSource: PolicyManifestParsed = structuredClone(parsed);
    const g = withSource.packs[0]!.guards[0];
    if (g !== undefined) {
      (g as { sourceLocation?: unknown }).sourceLocation = {
        file: "packages/p/src/policies.ts",
        line: 42,
        column: 3,
      };
    }
    const d = diffManifests(withSource, parsed);
    expect(d.identical).toBe(true);
    expect(d.counts.changed).toBe(0);
  });
});
