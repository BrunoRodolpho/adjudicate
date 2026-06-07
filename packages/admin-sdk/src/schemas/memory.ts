import { z } from "zod";

/** Wire schema for a session-memory snapshot (ADR-126). `memory` is passthrough. */
export const MemorySnapshotQuerySchema = z.object({ sessionId: z.string() });

export const MemorySnapshotSchema = z.object({
  sessionId: z.string(),
  present: z.boolean(),
  memory: z.unknown(),
  retrievedAt: z.string(),
});

export type MemorySnapshotParsed = z.infer<typeof MemorySnapshotSchema>;
