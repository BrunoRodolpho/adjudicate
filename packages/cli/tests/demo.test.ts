/**
 * `adjudicate demo` — bundled zero-config tour of the six Decision kinds.
 *
 * Asserts the demo renders ALL SIX decision kinds from its OWN bundled
 * scenarios (no `examples/` dependency) through the existing simulate
 * renderer, with no network / API key / Docker. Output is captured via the
 * `stdout` injection point — nothing reaches a real terminal or socket.
 */

import { describe, expect, it } from "vitest";
import { runDemo } from "../src/commands/demo.js";

const ALL_SIX = [
  "EXECUTE",
  "REFUSE",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "REWRITE",
] as const;

interface CaptureSession {
  readonly lines: string[];
  readonly write: (line: string) => void;
  readonly joined: () => string;
}

function capture(): CaptureSession {
  const lines: string[] = [];
  return {
    lines,
    write: (line) => {
      lines.push(line);
    },
    joined: () => lines.join("\n"),
  };
}

describe("demo — bundled six-decision tour", () => {
  it("renders all six decision kinds in text mode (box headers)", async () => {
    const cap = capture();

    await runDemo({ format: "text", stdout: cap.write });

    const text = cap.joined();
    // Each scenario prints a `DECISION:` box header via the shared renderer.
    expect(text).toMatch(/DECISION:/);
    for (const kind of ALL_SIX) {
      expect(text, `expected decision kind ${kind} in demo output`).toContain(
        kind,
      );
    }
    // The closing roll-up reports every scenario matched its expected kind.
    expect(text).toMatch(/6 matched/);
  });

  it("emits a JSON diff report with all six kinds matched", async () => {
    const cap = capture();

    await runDemo({ format: "json", stdout: cap.write });

    const report = JSON.parse(cap.joined()) as {
      pack: { id: string };
      summary: { total: number; matched: number; changed: number; errors: number };
      results: Array<{ scenario: string; status: string; decision: string }>;
    };

    expect(report.pack.id).toBe("demo-vacation-approval");
    expect(report.summary.total).toBe(6);
    expect(report.summary.matched).toBe(6);
    expect(report.summary.changed).toBe(0);
    expect(report.summary.errors).toBe(0);

    const decisions = report.results.map((r) => r.decision).sort();
    expect(decisions).toEqual([...ALL_SIX].sort());
    for (const r of report.results) {
      expect(r.status).toBe("match");
    }
  });

  it("does not depend on the @example/vacation-approval package", async () => {
    // The demo loads its OWN bundled pack id, not the example's
    // ("vacation-approval"). This guards against a regression that re-points
    // the demo at the private example package.
    const cap = capture();
    await runDemo({ format: "json", stdout: cap.write });
    const report = JSON.parse(cap.joined()) as { pack: { id: string } };
    expect(report.pack.id).toBe("demo-vacation-approval");
    expect(report.pack.id).not.toBe("vacation-approval");
  });
});
