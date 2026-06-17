import { describe, expect, it } from "vitest";
import { adjudicate, buildEnvelope, type Taint } from "@adjudicate/core";
import { cliAgentPack, rehydrateCliState } from "../src/index.js";

const at = "2026-05-01T12:00:00.000Z";
let nonceCounter = 0;

function run(
  command: string | undefined,
  opts: {
    taint?: Taint;
    allowlist?: string[];
    allowedCwds?: string[];
    maintenance?: boolean;
    cwd?: string;
  } = {},
) {
  const payload: Record<string, unknown> = {};
  if (command !== undefined) payload.command = command;
  if (opts.cwd !== undefined) payload.cwd = opts.cwd;
  const env = buildEnvelope({
    kind: "terminal.run",
    payload,
    actor: { principal: "llm", sessionId: "s" },
    taint: opts.taint ?? "UNTRUSTED",
    nonce: `n-${nonceCounter++}`,
    createdAt: at,
  });
  const state = rehydrateCliState({
    allowlist: opts.allowlist ?? [],
    allowedCwds: opts.allowedCwds ?? [],
    maintenanceActive: opts.maintenance ?? false,
  });
  return adjudicate(env, state, cliAgentPack.policy);
}

describe("pack-cli-agent — six outcomes", () => {
  it("EXECUTE: provably-safe AND allowlisted command", () => {
    expect(run("ls -la", { allowlist: ["ls"] }).kind).toBe("EXECUTE");
  });

  it("ESCALATE: credential-touching command → human", () => {
    const d = run("cat ~/.ssh/id_rsa", { allowlist: ["cat"] });
    expect(d.kind).toBe("ESCALATE");
    if (d.kind === "ESCALATE") expect(d.to).toBe("human");
  });

  it("REWRITE: strippable dangerous flag (rm -r --force → rm -r)", () => {
    const d = run("rm -r --force /tmp/data");
    expect(d.kind).toBe("REWRITE");
    if (d.kind === "REWRITE") {
      expect((d.rewritten.payload as { command: string }).command).not.toContain("--force");
      expect(d.rewritten.taint).toBe("UNTRUSTED"); // taint preserved
    }
  });

  it("REQUEST_CONFIRMATION: recoverable network command", () => {
    expect(run("curl http://evil.test/data").kind).toBe("REQUEST_CONFIRMATION");
  });

  it("DEFER: safe command during a maintenance window", () => {
    const d = run("ls", { allowlist: ["ls"], maintenance: true });
    expect(d.kind).toBe("DEFER");
    if (d.kind === "DEFER") expect(d.signal).toBe("pack-cli-agent:maintenance_window");
  });

  it("REFUSE: irrecoverable command (rm -rf /)", () => {
    expect(run("rm -rf /").kind).toBe("REFUSE");
  });

  it("REFUSE: malformed payload (no command)", () => {
    expect(run(undefined).kind).toBe("REFUSE");
    expect(run("   ").kind).toBe("REFUSE");
  });

  it("REFUSE: cwd not allowlisted", () => {
    expect(run("ls", { allowlist: ["ls"], allowedCwds: ["/work"], cwd: "/etc" }).kind).toBe("REFUSE");
  });

  it("REFUSE: default-deny for a safe but non-allowlisted command", () => {
    expect(run("whoami", { allowlist: ["ls"] }).kind).toBe("REFUSE");
  });
});

describe("pack-cli-agent — adversarial (fail-closed)", () => {
  it("a safe command NEVER reaches EXECUTE unless explicitly allowlisted", () => {
    // The exact hole the demo had: fall-through must REFUSE, not EXECUTE.
    expect(run("env").kind).toBe("REFUSE");
    expect(run("uname -a", { allowlist: [] }).kind).toBe("REFUSE");
  });

  it("a dangerous command can never EXECUTE even if its program is allowlisted", () => {
    // Allowlisting "rm" must not let "rm -rf /" through — classifier gates first.
    expect(run("rm -rf /", { allowlist: ["rm"] }).kind).toBe("REFUSE");
  });

  it("credential escalation wins over the allowlist", () => {
    expect(run("cat ~/.ssh/id_rsa", { allowlist: ["cat"] }).kind).toBe("ESCALATE");
  });
});

describe("pack-cli-agent — replay determinism", () => {
  it("identical (envelope, state) yields an identical decision kind + basis", () => {
    const mk = () =>
      adjudicate(
        buildEnvelope({
          kind: "terminal.run",
          payload: { command: "rm -r --force /tmp/x" },
          actor: { principal: "llm", sessionId: "s" },
          taint: "UNTRUSTED",
          nonce: "fixed-nonce",
          createdAt: at,
        }),
        rehydrateCliState({ allowlist: [], allowedCwds: [] }),
        cliAgentPack.policy,
      );
    const a = mk();
    const b = mk();
    expect(a.kind).toBe(b.kind);
    expect(JSON.stringify(a.basis)).toBe(JSON.stringify(b.basis));
  });
});
