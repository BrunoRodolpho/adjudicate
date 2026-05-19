/**
 * @adjudicate/locales-pt-BR — Brazilian Portuguese (pt-BR) refusal strings.
 *
 * Use with `localizeDecision(decision, portugueseRefusalMessages)` from
 * `@adjudicate/core` at presentation time.
 *
 * ## Usage
 *
 * ```ts
 * import { localizeDecision } from "@adjudicate/core";
 * import { portugueseRefusalMessages } from "@adjudicate/locales-pt-BR";
 *
 * const userVisible = localizeDecision(decision, portugueseRefusalMessages);
 * ```
 *
 * The kernel emits English defaults; this package supplies localized
 * equivalents for the kernel-emitted refusal codes. Pack authors who emit
 * Pack-specific codes extend the dictionary by merging — see the README.
 */

import type { RefusalMessages } from "@adjudicate/core";

/**
 * pt-BR mapping for kernel-emitted refusal codes. The string IDs are
 * stable; see `@adjudicate/core`'s `KERNEL_REFUSAL_CODES` for the full
 * set the kernel itself may emit.
 *
 * `fallback` covers any unrecognized code (typically Pack-specific
 * refusals); compose your Pack's pt-BR strings on top via spread.
 */
export const portugueseRefusalMessages: RefusalMessages = {
  fallback: "Essa ação não é permitida neste momento.",
  byCode: {
    kill_switch_active: "Sistema temporariamente indisponível.",
    schema_version_unsupported: "Não foi possível processar essa ação no momento.",
    taint_level_insufficient: "Não posso realizar essa ação com a informação disponível.",
    default_deny: "Essa ação não é permitida neste momento.",
    guard_panic: "Sistema temporariamente indisponível.",
    ledger_replay_suppressed: "Essa ação já foi processada.",
    kernel_deadline_exceeded: "Não foi possível processar a ação no tempo disponível.",
  },
};
