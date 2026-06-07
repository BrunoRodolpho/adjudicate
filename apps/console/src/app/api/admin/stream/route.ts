import type { AuditRecord } from "@adjudicate/core";
import { getAuditBus } from "@/lib/audit-bus";
import { requireConsoleAdminAuth } from "@/lib/admin-auth";

/**
 * Real-time audit live-tail stream (Server-Sent Events).
 *
 * Replaces the 2-second polling transport with a push stream fed by the
 * `AuditEventBus` (ADR-128). Each `AuditRecord` published on the bus is emitted
 * as an SSE `message` event:
 *
 *   id: <intentHash>
 *   data: <AuditRecord JSON>
 *
 * Heartbeat comments (`: ping`) are sent on an interval so intermediaries and
 * the browser keep the connection open.
 *
 * Transport availability: the bus is only wired when `REDIS_URL` is set (a real
 * kernel publishes there). When absent, this endpoint returns 501 and the
 * client (`useLiveTail`) falls back to polling. SSE is same-origin, so the
 * browser sends session cookies automatically — adopters using header/bearer
 * auth should gate via a cookie session or swap to a fetch-stream with headers.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Heartbeat cadence — keeps the stream alive through idle periods + proxies. */
const HEARTBEAT_MS = 15_000;

export function GET(req: Request): Response {
  const denied = requireConsoleAdminAuth(req);
  if (denied) return denied;

  const bus = getAuditBus();
  if (!bus) {
    // No live transport configured → tell the client to fall back to polling.
    return new Response(
      "Live tail unavailable: no AuditEventBus configured (set REDIS_URL). Falling back to polling.",
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client went away mid-write) — stop.
          closed = true;
        }
      };

      // Opening comment + a retry hint so the browser reconnects after 3s.
      safeEnqueue(": connected\nretry: 3000\n\n");

      const unsubscribe = bus.subscribe((record: AuditRecord) => {
        // Handlers must not throw (bus contract). JSON.stringify of a plain
        // AuditRecord value is safe; guard regardless.
        try {
          const payload = JSON.stringify(record);
          safeEnqueue(`id: ${record.intentHash}\ndata: ${payload}\n\n`);
        } catch {
          // Skip an unserializable record rather than tearing down the stream.
        }
      });

      const heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          unsubscribe();
        } catch {
          /* best-effort */
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Tear down when the client disconnects.
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
