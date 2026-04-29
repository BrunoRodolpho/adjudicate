import type { AuditRecord } from "@adjudicate/core";
import type { AuditQuery, AuditQueryResult } from "@/types/adjudicate";
import { trpc } from "@/lib/trpc-client";
import type { AuditGateway } from "./index";

/**
 * AuditGateway implementation backed by the @adjudicate/admin-sdk tRPC
 * client. Used when NEXT_PUBLIC_ADJUDICATE_MODE=live.
 *
 * Type story: AdminRouter is imported as a type-only symbol from the SDK,
 * so every procedure return type is inferred. The `as readonly AuditRecord[]`
 * cast on the records array is a documented architectural concession:
 * the SDK's schema is intentionally LOOSER than the kernel's `DecisionBasis`
 * type (kernel has per-category narrow `code: BasisCode<C>`; schema has
 * wide `code: string`). The kernel only emits codes from the BASIS_CODES
 * vocabulary, so every record on the wire is *structurally* valid as a
 * core AuditRecord — we just can't prove it generically. See
 * packages/admin-sdk/src/schemas/decision.ts for the full reasoning.
 */
export function createTrpcGateway(): AuditGateway {
  return {
    async queryAudit(q: AuditQuery): Promise<AuditQueryResult> {
      const result = await trpc.audit.query.query({
        ...q,
        limit: q.limit ?? 100,
      });
      return {
        records: result.records as readonly AuditRecord[],
        nextCursor: result.nextCursor,
      };
    },
    async getDecision(intentHash: string): Promise<AuditRecord | null> {
      const result = await trpc.audit.byHash.query({ intentHash });
      return result as AuditRecord | null;
    },
  };
}
