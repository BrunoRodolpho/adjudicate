"use client";

import { useEmergencyHistory } from "@/hooks/useEmergencyHistory";
import { formatRelative } from "@/lib/format";

export function EmergencyHistoryList() {
  const { data: events, isLoading } = useEmergencyHistory(20);

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[10px] uppercase tracking-section text-faint">
        Recent governance events
      </h3>
      {isLoading ? (
        <p className="text-[11px] italic text-muted">Loading…</p>
      ) : !events || events.length === 0 ? (
        <p className="text-[11px] italic text-faint">
          No governance events recorded yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-sm border border-edge bg-canvas px-2 py-1.5 text-[11px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink">
                  {event.previousStatus} →{" "}
                  <strong className="font-semibold">{event.newStatus}</strong>
                </span>
                <time
                  dateTime={event.at}
                  title={event.at}
                  className="tabular-nums text-faint"
                >
                  {formatRelative(event.at)}
                </time>
              </div>
              <div className="mt-0.5 text-muted">
                <span className="text-faint">by </span>
                {event.actor.displayName ?? event.actor.id}
                <span className="ml-1 text-faint">({event.actor.id})</span>
              </div>
              <p className="mt-1 italic text-muted/80">"{event.reason}"</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
