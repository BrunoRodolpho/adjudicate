import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore } from "../src/store/index.js";
import { ALL, fixtureRefuse, fixtureExecute } from "./fixtures.js";

describe("createInMemoryAuditStore", () => {
  const store = createInMemoryAuditStore({ records: ALL });

  describe("query", () => {
    it("returns newest-first by `at`", async () => {
      const result = await store.query({ limit: 100 });
      expect(result.records).toHaveLength(ALL.length);
      for (let i = 1; i < result.records.length; i++) {
        expect(result.records[i - 1]!.at >= result.records[i]!.at).toBe(true);
      }
    });

    it("respects limit exactly", async () => {
      const result = await store.query({ limit: 3 });
      expect(result.records).toHaveLength(3);
    });

    it("filters by since (inclusive lower bound)", async () => {
      const result = await store.query({
        since: "2026-04-28T18:00:00.000Z",
        limit: 100,
      });
      // Execute (20:00), Refuse (19:00), Defer (18:00) — three records.
      expect(result.records).toHaveLength(3);
    });

    it("filters by until (inclusive upper bound)", async () => {
      const result = await store.query({
        until: "2026-04-28T17:00:00.000Z",
        limit: 100,
      });
      // Escalate (17:00), RequestConfirmation (16:00), Rewrite (15:00).
      expect(result.records).toHaveLength(3);
    });

    it("AND-composes since and until", async () => {
      const result = await store.query({
        since: "2026-04-28T17:00:00.000Z",
        until: "2026-04-28T19:00:00.000Z",
        limit: 100,
      });
      // Refuse (19:00), Defer (18:00), Escalate (17:00).
      expect(result.records).toHaveLength(3);
    });

    it("ignores cursor (in-memory store has no pagination)", async () => {
      const a = await store.query({ limit: 100 });
      const b = await store.query({ limit: 100, cursor: "anything" });
      expect(a.records).toHaveLength(b.records.length);
    });
  });

  describe("getByIntentHash", () => {
    it("returns the matching record", async () => {
      const found = await store.getByIntentHash(fixtureRefuse.intentHash);
      expect(found?.intentHash).toBe(fixtureRefuse.intentHash);
    });

    it("returns null for unknown hash", async () => {
      const found = await store.getByIntentHash("0xdeadbeef");
      expect(found).toBeNull();
    });

    it("returns null for empty string", async () => {
      const found = await store.getByIntentHash("");
      expect(found).toBeNull();
    });
  });

  describe("immutability", () => {
    it("does not leak the input array reference", async () => {
      const inputRecords = [...ALL];
      const localStore = createInMemoryAuditStore({ records: inputRecords });
      // Mutating the input should not affect the store.
      inputRecords.length = 0;
      const result = await localStore.query({ limit: 100 });
      expect(result.records.length).toBe(ALL.length);
    });

    it("returns same intentHash for the same fixture", async () => {
      // The fixture is built at module load — its hash is deterministic.
      const a = await store.getByIntentHash(fixtureExecute.intentHash);
      const b = await store.getByIntentHash(fixtureExecute.intentHash);
      expect(a?.intentHash).toBe(b?.intentHash);
    });
  });
});
