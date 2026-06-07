# @adjudicate/approval-engine

Reference orchestration for the `REQUEST_CONFIRMATION` → human review → resume
flow, with pluggable channels (webhook, Slack, Teams, email).

```ts
import {
  createApprovalEngine,
  createInMemoryApprovalRegistry,
  createConsoleLogChannel,
} from "@adjudicate/approval-engine";

const engine = createApprovalEngine({
  agent,                                  // adapter-core AdjudicatedAgent
  registry: createInMemoryApprovalRegistry(),
  channels: [createConsoleLogChannel()],
  resolveStateContext: async (sessionId) => loadStateAndContext(sessionId),
});

// when agent.send() returns outcome.kind === "awaiting_confirmation":
await engine.request({ token, sessionId, intentHash, intentKind, prompt, taint });

// when the human approves/declines (Slack button, webhook callback, console):
await engine.resolve({ token, accepted: true, by: { id: "alice" } });
```

## Design

- **Owns a projection registry, not the ConfirmationStore.** adapter-core's
  `ConfirmationStore` is single-use `put`/`take` and must not be enumerated. The
  engine keeps its own read-optimized `ApprovalRequest` index (status, prompt,
  channel) for the operator UI; the authoritative envelope blob stays in the
  ConfirmationStore.
- **The engine owns none of the crypto.** `resolve()` calls `agent.confirm()`,
  which performs the single-use token take, timing-safe hash verification, and
  `confirmationReceipt` forwarding. The engine adds zero behavioral drift.
- **State fetched fresh at resolve time** via `resolveStateContext(sessionId)` —
  the out-of-band callback fires hours later, and re-adjudication should run
  against current state. The engine stores neither state nor context, so nothing
  reaches `intentHash`.
- **Channels are I/O.** Ships `webhook` + `console-log`; Slack/Teams/email are
  one-file `ApprovalChannel` implementations with injected transport.
