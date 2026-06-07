import { describe, expect, it } from "vitest";
import { buildEnvelope } from "@adjudicate/core";
import { classifyCommand, createCommandRiskGuard } from "../src/index.js";

interface P {
  readonly command: string;
}

const guard = createCommandRiskGuard<string, P, unknown>({
  matches: (env) => env.kind === "terminal.run",
  extractCommand: (env) => (env.payload as P).command,
  commandField: "command",
});

const env = (command: unknown) =>
  buildEnvelope({
    kind: "terminal.run",
    payload: { command },
    actor: { principal: "llm", sessionId: "s" },
    taint: "UNTRUSTED",
    nonce: "n-1",
    createdAt: "2026-04-29T12:00:00.000Z",
  });

describe("createCommandRiskGuard — adversarial", () => {
  it("catches whitespace-padded rm -rf /", () => {
    expect(guard(env("rm   -rf   /"), null)?.kind).toBe("REFUSE");
  });

  it("catches a fork bomb", () => {
    expect(classifyCommand(":(){ :|:& };:").disposition).toBe("refuse");
  });

  it("a REWRITE never re-classifies as MORE dangerous than the original", () => {
    const d = guard(env("rm -rf /tmp/x --no-preserve-root --force"), null);
    if (d?.kind !== "REWRITE") throw new Error("expected REWRITE");
    const sanitized = (d.rewritten.payload as P).command;
    const order = { safe: 0, confirm: 1, rewrite: 1, refuse: 2 } as const;
    expect(order[classifyCommand(sanitized).disposition]).toBeLessThanOrEqual(
      order[classifyCommand("rm -rf /tmp/x --no-preserve-root --force").disposition],
    );
  });

  it("returns null on a non-string command field (no throw)", () => {
    expect(guard(env(42), null)).toBeNull();
    expect(guard(env(undefined), null)).toBeNull();
  });
});
