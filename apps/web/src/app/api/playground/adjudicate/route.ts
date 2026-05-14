import { runPlayground } from "@/lib/kernel-runner";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/playground/adjudicate
 *
 * Body: { intentKind: string, payload: Record<string, unknown>, state?: unknown }
 *
 * Returns the resolved Decision + AuditRecord. Server-side kernel
 * invocation — client components never import `@adjudicate/core`.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { intentKind?: unknown }).intentKind !== "string" ||
    typeof (body as { payload?: unknown }).payload !== "object" ||
    (body as { payload?: unknown }).payload === null
  ) {
    return NextResponse.json(
      { error: "invalid_body", expected: "{ intentKind: string, payload: object, state?: unknown }" },
      { status: 400 },
    );
  }
  const { intentKind, payload, state } = body as {
    intentKind: string;
    payload: Record<string, unknown>;
    state?: unknown;
  };
  try {
    const result = await runPlayground({ intentKind, payload, state });
    // The Map-based pack states (PIX charges, KYC sessions, deployment
    // approvals) become {} under JSON.stringify — that's fine, the
    // playground emits round-trippable envelopes + decisions only.
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
