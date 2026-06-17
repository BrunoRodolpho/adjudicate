import { getLearningBus, type LearningEvent } from "@/lib/learning-bus";
import { requireConsoleAdminAuth } from "@/lib/admin-auth";

/**
 * Real-time learning-event stream (Server-Sent Events) — ERDS-060.
 *
 * Streams each `LearningEvent` published by the ibatexas runtime on the
 * `learning.event.v1` Redis channel as an SSE `message`:
 *
 *   id: <agentId>:<sessionId>
 *   data: <LearningEvent JSON>
 *
 * Heartbeat comments (`: ping`) keep the connection open through idle periods +
 * proxies. Mirrors the audit live-tail stream (`../stream/route.ts`).
 *
 * Transport availability: the bus is only wired when `REDIS_URL` is set (the
 * runtime publishes there). When absent, this endpoint returns 501 and the
 * client treats the learning feed as disabled. SSE is same-origin, so the
 * browser sends session cookies automatically.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Heartbeat cadence — keeps the stream alive through idle periods + proxies. */
const HEARTBEAT_MS = 15_000;

export function GET(req: Request): Response {
  const denied = requireConsoleAdminAuth(req);
  if (denied) return denied;

  const bus = getLearningBus();
  if (!bus) {
    // No live transport configured → learning feed is disabled.
    return new Response(
      "Learning stream unavailable: no learning bus configured (set REDIS_URL).",
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

      // subscribe() is async; capture the unsubscribe for cleanup. If the
      // subscription fails (Redis blip), close the stream rather than hang.
      let unsubscribe: (() => Promise<void>) | null = null;
      const subscribed = bus
        .subscribe((event: LearningEvent) => {
          try {
            const payload = JSON.stringify(event);
            // #28-5: strip CR/LF so a newline in agentId/sessionId can't inject
            // extra SSE fields/events into the stream. (`data:` is JSON, already
            // newline-escaped, so only the `id:` line needs the guard.)
            const id = `${event.agentId}:${event.sessionId}`.replace(/[\r\n]/g, "");
            safeEnqueue(`id: ${id}\ndata: ${payload}\n\n`);
          } catch {
            // Skip an unserializable event rather than tearing down the stream.
          }
        })
        .then((unsub) => {
          unsubscribe = unsub;
          // If the client already disconnected before subscribe resolved, tear
          // the subscription down immediately.
          if (closed) void unsub().catch(() => {});
        })
        .catch((err) => {
          console.error("[learning-stream] subscribe failed:", err);
          cleanup();
        });
      void subscribed;

      const heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), HEARTBEAT_MS);

      function cleanup(): void {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (unsubscribe) {
          void unsubscribe().catch(() => {
            /* best-effort */
          });
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

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
