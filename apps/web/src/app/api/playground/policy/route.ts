import { NextResponse } from "next/server";
import {
  describePolicyBundle,
  type PolicyBundle,
} from "@adjudicate/core";
import { deploymentsApprovalPack } from "@adjudicate/pack-deployments-approval";
import { paymentsPixPack } from "@adjudicate/pack-payments-pix";
import { IdentityKycPack } from "@adjudicate/pack-identity-kyc";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * GET /api/playground/policy
 *
 * Returns the structural descriptor of each shipped Pack's PolicyBundle —
 * powers the GuardMetadata force-graph section on the homepage. Static-
 * generated; refreshed each build. No user input, no kernel run.
 */
export async function GET() {
  const packs = [
    { id: paymentsPixPack.id, name: "PIX", bundle: paymentsPixPack.policy },
    { id: IdentityKycPack.id, name: "KYC", bundle: IdentityKycPack.policy },
    {
      id: deploymentsApprovalPack.id,
      name: "Deployments",
      bundle: deploymentsApprovalPack.policy,
    },
  ];
  const descriptors = packs.map((p) => ({
    id: p.id,
    name: p.name,
    descriptor: describePolicyBundle(
      p.bundle as PolicyBundle<string, unknown, unknown>,
    ),
  }));
  return NextResponse.json({ packs: descriptors });
}
