/**
 * adjudicateWithDeadline — race the synchronous kernel against a wall-clock
 * deadline.
 *
 * The pure `adjudicate()` is synchronous and fast for well-formed policies.
 * This wrapper provides a defense-in-depth budget for adopters who want to
 * cap kernel-side latency (long state walks, future async guards, etc.) and
 * convert deadline misses into a typed SECURITY refusal rather than a hung
 * caller.
 *
 * Limits: the kernel is currently fully synchronous, so a misbehaving guard
 * doing CPU-bound work will block the event loop and the deadline timer
 * cannot fire until the work completes. The wrapper is honest protection
 * against future async guards, microtask-bound work, and a defensive
 * "shape" that adopter call-sites can adopt today without rewrite later.
 *
 * `@adjudicate/runtime`'s `deadlinePromise` is the streaming-generator
 * analog. Both share the same "race against AbortSignal" idiom; the
 * primitive is intentionally tiny so each package owns its dependency
 * direction (core does not depend on runtime).
 */

import { basis, BASIS_CODES } from "../basis-codes.js";
import { decisionRefuse, type Decision } from "../decision.js";
import type { IntentEnvelope } from "../envelope.js";
import { refuse } from "../refusal.js";
import { adjudicate } from "./adjudicate.js";
import type { PolicyBundle } from "./policy.js";

export interface AdjudicateWithDeadlineOptions {
  /** Hard wall-clock budget in milliseconds. */
  readonly deadlineMs: number;
}

/**
 * Run `adjudicate()` and return its Decision, or — if `deadlineMs` elapses
 * first — a SECURITY refusal with code `kernel_deadline_exceeded`.
 *
 * The deadline is observed via a microtask-scheduled kernel call raced
 * against a setTimeout-backed sentinel; for synchronous kernels the kernel
 * almost always wins. Returning here is always a Promise; the kernel value
 * is delivered on the next microtask if not raced.
 */
export async function adjudicateWithDeadline<K extends string, P, S>(
  envelope: IntentEnvelope<K, P>,
  state: S,
  policy: PolicyBundle<K, P, S>,
  options: AdjudicateWithDeadlineOptions,
): Promise<Decision> {
  // Non-positive budgets are a deterministic deadline miss — the caller
  // explicitly declared "no time available" and the wrapper must honour it.
  // Without this short-circuit, a microtask-scheduled kernel call would
  // resolve before any setTimeout-backed sentinel fires.
  if (options.deadlineMs <= 0) {
    return deadlineRefusal(options.deadlineMs);
  }

  const DEADLINE = Symbol("DEADLINE");
  type RaceResult = Decision | typeof DEADLINE;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof DEADLINE>((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE), options.deadlineMs);
  });
  const work = Promise.resolve().then<Decision>(() =>
    adjudicate(envelope, state, policy),
  );

  try {
    const winner: RaceResult = await Promise.race<RaceResult>([work, deadline]);
    if (winner === DEADLINE) {
      return deadlineRefusal(options.deadlineMs);
    }
    return winner;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function deadlineRefusal(deadlineMs: number): Decision {
  return decisionRefuse(
    refuse(
      "SECURITY",
      "kernel_deadline_exceeded",
      "Não foi possível processar a ação no tempo disponível.",
      `deadlineMs=${deadlineMs}`,
    ),
    [
      basis("deadline", BASIS_CODES.deadline.EXCEEDED, {
        deadlineMs,
      }),
    ],
  );
}
