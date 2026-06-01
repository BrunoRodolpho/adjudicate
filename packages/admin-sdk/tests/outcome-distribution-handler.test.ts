import { describe, expect, it } from "vitest";
import {
  createOutcomeDistributionHandler,
  type OutcomeDistributionStore,
} from "../src/handlers/outcome-distribution.js";
import type { AuditStore } from "../src/store/index.js";
import type {
  AuditQuery,
  AuditQueryResult,
} from "../src/schemas/query.js";
import type { OutcomeDistributionQuery } from "../src/schemas/outcome-distribution.js";
import { ALL } from "./fixtures.js";

/**
 * APIReviewer-005 — the documented `until`-defaults-to-"now" behavior must be
 * IMPLEMENTED by the handler (via an injected clock), not silently dropped.
 *
 * Fixtures span 2026-04-28T15:00 .. 20:00 (one record per hour: Rewrite 15:00,
 * RequestConfirmation 16:00, Escalate 17:00, Defer 18:00, Refuse 19:00,
 * Execute 20:00).
 */

const FIXED_NOW = "2026-04-28T17:30:00.000Z";

/** Capturing AuditStore — records the last query and returns ALL fixtures. */
function captureStore(): {
  store: AuditStore;
  lastQuery: () => AuditQuery | undefined;
} {
  let captured: AuditQuery | undefined;
  const store: AuditStore = {
    async query(q: AuditQuery): Promise<AuditQueryResult> {
      captured = q;
      return { records: ALL };
    },
    async getByIntentHash() {
      return null;
    },
  };
  return { store, lastQuery: () => captured };
}

describe("createOutcomeDistributionHandler — until defaults to clock() (APIReviewer-005)", () => {
  it("passes the injected clock's value as `until` to store.query when input.until is absent", async () => {
    const { store, lastQuery } = captureStore();
    const handler = createOutcomeDistributionHandler({
      store,
      clock: () => FIXED_NOW,
    });

    await handler({ since: "2026-04-28T00:00:00.000Z", bucket: "hour" });

    expect(lastQuery()?.until).toBe(FIXED_NOW);
  });

  it("excludes records with at > clock() from the aggregated result", async () => {
    const { store } = captureStore();
    const handler = createOutcomeDistributionHandler({
      store,
      clock: () => FIXED_NOW,
    });

    const result = await handler({
      since: "2026-04-28T00:00:00.000Z",
      bucket: "hour",
    });

    // Only 15:00, 16:00, 17:00 survive the resolved `until` of 17:30.
    // 18:00 / 19:00 / 20:00 are excluded.
    const totalCounted = result.buckets.reduce(
      (sum, b) =>
        sum +
        b.EXECUTE +
        b.REFUSE +
        b.REWRITE +
        b.DEFER +
        b.ESCALATE +
        b.REQUEST_CONFIRMATION,
      0,
    );
    expect(totalCounted).toBe(3);
    // No bucket should be at or after 18:00.
    for (const b of result.buckets) {
      expect(b.at < "2026-04-28T18:00:00.000Z").toBe(true);
    }
  });

  it("honors an explicit input.until over the clock", async () => {
    const { store, lastQuery } = captureStore();
    const handler = createOutcomeDistributionHandler({
      store,
      clock: () => FIXED_NOW,
    });

    await handler({
      since: "2026-04-28T00:00:00.000Z",
      until: "2026-04-28T16:30:00.000Z",
      bucket: "hour",
    });

    expect(lastQuery()?.until).toBe("2026-04-28T16:30:00.000Z");
  });

  it("forwards the resolved `until` to a native OutcomeDistributionStore", async () => {
    let nativeQuery: OutcomeDistributionQuery | undefined;
    const nativeStore: AuditStore & OutcomeDistributionStore = {
      async query(): Promise<AuditQueryResult> {
        return { records: [] };
      },
      async getByIntentHash() {
        return null;
      },
      async outcomeDistribution(q) {
        nativeQuery = q;
        return { buckets: [] };
      },
    };
    const handler = createOutcomeDistributionHandler({
      store: nativeStore,
      clock: () => FIXED_NOW,
    });

    await handler({ since: "2026-04-28T00:00:00.000Z", bucket: "day" });

    expect(nativeQuery?.until).toBe(FIXED_NOW);
  });
});
