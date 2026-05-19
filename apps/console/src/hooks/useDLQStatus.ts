"use client";

/**
 * DLQ status stub.
 *
 * The audit-buffer DLQ store is a kernel-side construct. There is no
 * admin-sdk endpoint that surfaces "how many records sit in the in-memory
 * DLQ buffer" — this hook returns a static `{ pending: 0 }` so the
 * banner machinery in {@link FailureBanners} renders correctly today.
 *
 * Wiring to a real `dlqStatus` admin-sdk procedure lands when audit-sink
 * buffering becomes the post-v0.6 priority. The interface here is the
 * shape that procedure must satisfy — operators can read this file to
 * understand the gap.
 */
export interface DLQStatus {
  /** Records pending re-flush from the buffered audit sink. */
  readonly pending: number;
  /** ISO timestamp of the oldest pending record, if any. */
  readonly oldestAt?: string;
}

export function useDLQStatus(): { data: DLQStatus; isStub: boolean } {
  return {
    data: { pending: 0 },
    isStub: true,
  };
}
