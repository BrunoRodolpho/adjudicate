import { describe, expect, it } from "vitest";
import { runPlayground } from "./kernel-runner";

/**
 * apps/web's first automated test. Pins the PII-demo playground behaviour the
 * marketing site advertises — in particular that the redaction patterns resist
 * separator evasion (dashless SSN, space/dash-grouped PAN), which was previously
 * only manually verified.
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
