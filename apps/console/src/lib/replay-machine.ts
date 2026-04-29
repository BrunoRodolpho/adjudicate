import type { ReplayResult } from "@adjudicate/admin-sdk";
import { assign, fromPromise, setup } from "xstate";
import { trpc } from "@/lib/trpc-client";

/**
 * State machine driving the `<ReplayDialog>` lifecycle.
 *
 * States:
 *   idle    — dialog mounted but no replay running yet
 *   running — invoking the tRPC `replay.run` mutation
 *   success — replay returned a ReplayResult; rendering the diff
 *   error   — tRPC threw (PRECONDITION_FAILED, NOT_FOUND, REPLAY_FAILED, network)
 *
 * Events:
 *   OPEN({ intentHash })  — start a replay for the given hash
 *   RETRY                 — re-invoke the replay (from error state)
 *   CLOSE                 — return to idle and clear context
 *
 * The async invocation is modeled as an XState v5 invoked actor
 * (`fromPromise`) so the machine handles the lifecycle (loading flag,
 * cancellation on close) without pulling in TanStack Query — which
 * would mostly mirror what the machine already provides.
 */

interface ReplayContext {
  intentHash: string | null;
  result: ReplayResult | null;
  error: string | null;
}

const initialContext: ReplayContext = {
  intentHash: null,
  result: null,
  error: null,
};

export const replayMachine = setup({
  types: {
    context: {} as ReplayContext,
    events: {} as
      | { type: "OPEN"; intentHash: string }
      | { type: "RETRY" }
      | { type: "CLOSE" },
  },
  actors: {
    runReplay: fromPromise(
      async ({ input }: { input: { intentHash: string } }) => {
        return trpc.replay.run.mutate({ intentHash: input.intentHash });
      },
    ),
  },
}).createMachine({
  id: "replay",
  initial: "idle",
  context: initialContext,
  states: {
    idle: {
      on: {
        OPEN: {
          target: "running",
          actions: assign({
            intentHash: ({ event }) => event.intentHash,
            result: null,
            error: null,
          }),
        },
      },
    },
    running: {
      invoke: {
        src: "runReplay",
        input: ({ context }) => ({ intentHash: context.intentHash! }),
        onDone: {
          target: "success",
          actions: assign({
            result: ({ event }) => event.output as ReplayResult,
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : String(event.error),
          }),
        },
      },
      on: {
        CLOSE: {
          target: "idle",
          actions: assign(() => initialContext),
        },
      },
    },
    success: {
      on: {
        CLOSE: {
          target: "idle",
          actions: assign(() => initialContext),
        },
      },
    },
    error: {
      on: {
        RETRY: {
          target: "running",
          actions: assign({ error: null }),
        },
        CLOSE: {
          target: "idle",
          actions: assign(() => initialContext),
        },
      },
    },
  },
});
