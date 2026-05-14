import { NextResponse, type NextRequest } from "next/server";
import { recentRecords } from "@/lib/kernel-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Bucket {
  at: string;
  EXECUTE: number;
  REFUSE: number;
  REWRITE: number;
  DEFER: number;
  ESCALATE: number;
  REQUEST_CONFIRMATION: number;
}

/**
 * GET /api/playground/outcome-distribution
 *
 * Aggregates the in-memory playground records into per-bucket counts so the
 * embedded outcome-distribution wrapper can render the same shape the console
 * dashboard does. Bucket granularity is fixed to "hour" — the playground's
 * record volume doesn't justify a day mode.
 */
export async function GET(_req: NextRequest) {
  const records = recentRecords(500);
  const buckets = new Map<string, Bucket>();
  for (const r of records) {
    const key = `${r.at.slice(0, 13)}:00:00.000Z`;
    const prior = buckets.get(key) ?? {
      at: key,
      EXECUTE: 0,
      REFUSE: 0,
      REWRITE: 0,
      DEFER: 0,
      ESCALATE: 0,
      REQUEST_CONFIRMATION: 0,
    };
    buckets.set(key, {
      ...prior,
      [r.decision.kind]: prior[r.decision.kind] + 1,
    });
  }
  const sorted = Array.from(buckets.values()).sort((a, b) =>
    a.at < b.at ? -1 : 1,
  );
  return NextResponse.json({ buckets: sorted });
}
