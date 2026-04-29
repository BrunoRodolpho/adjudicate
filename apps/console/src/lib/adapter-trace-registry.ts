import type { AuditRecord } from "@adjudicate/core";
import type { ComponentType } from "react";

/**
 * Adapter trace renderer registry.
 *
 * Adapters (e.g. @adjudicate/anthropic, @adjudicate/openai) opt into console
 * visualization of vendor-specific reasoning context by registering a renderer
 * keyed by adapter id. The audit explorer is otherwise vendor-neutral —
 * it speaks IntentEnvelope / Decision / AuditRecord, never tool_use blocks
 * or function-call shapes. Anything Anthropic-specific lives behind this
 * slot or doesn't render at all.
 */
export interface AdapterTraceProps {
  readonly record: AuditRecord;
}

const registry = new Map<string, ComponentType<AdapterTraceProps>>();

export function registerAdapterTrace(
  adapterId: string,
  Component: ComponentType<AdapterTraceProps>,
): void {
  registry.set(adapterId, Component);
}

export function getAdapterTraceComponent(
  adapterId: string,
): ComponentType<AdapterTraceProps> | undefined {
  return registry.get(adapterId);
}

/**
 * Detects which adapter (if any) authored the envelope. Today this is best-
 * effort heuristic: any envelope with `actor.principal === "llm"` *might* have
 * an adapter, but the kernel does not currently carry an adapter-id on the
 * envelope. When that field ships (as `envelope.metadata.adapter` or similar),
 * this lookup narrows accordingly.
 *
 * For now: returns `undefined`. The Adapter Trace section renders a "no
 * trace registered" disclaimer rather than fabricating data.
 */
export function detectAdapter(record: AuditRecord): string | undefined {
  if (record.envelope.actor.principal !== "llm") return undefined;
  // Future: read record.envelope.metadata?.adapter when the field is added.
  return undefined;
}
