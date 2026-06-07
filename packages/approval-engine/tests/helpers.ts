import type { AdjudicatedAgent, AgentTurnResult, ConfirmArgs } from "@adjudicate/adapter-core";

/**
 * Fake AdjudicatedAgent capturing confirm() calls. `confirmImpl` lets a test
 * simulate the real confirm() rejecting a single-use/tampered token.
 */
export function fakeAgent(confirmImpl?: (args: ConfirmArgs<unknown, unknown>) => Promise<AgentTurnResult<string[]>>) {
  const confirmCalls: ConfirmArgs<unknown, unknown>[] = [];
  const agent: AdjudicatedAgent<string, unknown, unknown, unknown, string[]> = {
    async send() {
      return { events: [], history: [], outcome: { kind: "completed", assistantText: "" } };
    },
    async resume() {
      return { events: [], history: [], outcome: { kind: "completed", assistantText: "" } };
    },
    async confirm(args) {
      confirmCalls.push(args as ConfirmArgs<unknown, unknown>);
      if (confirmImpl) return confirmImpl(args as ConfirmArgs<unknown, unknown>);
      return { events: [], history: [], outcome: { kind: "completed", assistantText: "ok" } };
    },
  };
  return { agent, confirmCalls };
}

export const baseRequest = {
  token: "tok-1",
  sessionId: "sess-1",
  intentHash: "0xabc",
  intentKind: "deploy.request",
  prompt: "Approve production deploy?",
  taint: "UNTRUSTED" as const,
};
