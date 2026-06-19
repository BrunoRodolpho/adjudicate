import { describe, expect, it } from "vitest";
import { runPlayground } from "./kernel-runner";

/**
 * apps/web's first automated test. Pins the PII-demo playground behaviour the
 * marketing site advertises — in particular that the redaction patterns resist
 * separator evasion (dashless SSN, space/dash-grouped PAN), which was previously
 * only manually verified.
 *
 * It is also the canonical proof for the Marketing-layer re-pitch (plan 131):
 * the record `runPlayground` returns carries an `auditHash` only — NO
 * `signature` (non-repudiation), NO `prevAuditHash` (inter-record hash-chain),
 * NO `kernelIdentity`. The web copy must therefore claim only keyless
 * tamper-evidence + replayability for the playground receipt, never "signed"
 * or "hash-chained". This test fails the moment the playground wiring (or copy
 * grounding) drifts from that shape.
 */
async function ticket(body: string) {
  const res = await runPlayground({
    intentKind: "support.ticket.create",
    payload: { subject: "help", body },
  });
  return res.decision.kind;
}

describe("PII demo playground", () => {
  it("REWRITE-redacts PII despite separator evasion", async () => {
    for (const body of [
      "my SSN is 123-45-6789",
      "ssn 123456789 thanks", // dashless
      "card 4111111111111111", // bare 16-digit PAN
      "card 4111 1111 1111 1111", // space-grouped PAN
      "card 4111-1111-1111-1111", // dash-grouped PAN
    ]) {
      expect(await ticket(body), body).toBe("REWRITE");
    }
  });

  it("EXECUTEs a clean ticket with no classified data", async () => {
    expect(await ticket("please add a dark mode to the dashboard")).toBe("EXECUTE");
  });
});

describe("playground receipt shape (grounds the 131 re-pitch copy)", () => {
  it("carries a keyless auditHash and NO signature / chain / kernelIdentity", async () => {
    const res = await runPlayground({
      intentKind: "support.ticket.create",
      payload: { subject: "help", body: "please add a dark mode to the dashboard" },
    });
    const { record } = res;
    // Keyless tamper-evidence is present — this is the field the copy may claim.
    // sha256Canonical returns a bare 64-char lowercase hex digest.
    expect(typeof record.auditHash).toBe("string");
    expect(record.auditHash).toMatch(/^[0-9a-f]{64}$/);
    // The forbidden claims: the playground wires no signer, ledger/chain, or
    // runtime context, so none of these fields land on the returned record.
    expect(record.signature).toBeUndefined();
    expect(record.prevAuditHash).toBeUndefined();
    expect(record.kernelIdentity).toBeUndefined();
  });
});
