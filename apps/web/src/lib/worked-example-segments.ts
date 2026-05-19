import type { AuditRecord, IntentEnvelope } from "@adjudicate/core";
import type { JsonSegment } from "@/lib/json-segment";

/**
 * Pure functions that turn the kernel's wire types (IntentEnvelope,
 * AuditRecord, payload objects) into pre-segmented JSON lines the
 * WorkedExamplePanel can render without parsing JSON.
 *
 * Producers stay typed: a missing field in IntentEnvelope would surface
 * here, not as a render-time JSON parse failure.
 */

const plain = (text: string): JsonSegment => ({
  before: text,
  highlight: "",
  after: "",
});

const hl = (before: string, highlight: string, after = ""): JsonSegment => ({
  before,
  highlight,
  after,
});

/** Truncate a long string with first-N + ellipsis + last-M characters. */
function truncMiddle(value: string, head = 12, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Render a JSON-safe value as a compact, mono-friendly string. */
function literal(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // For objects/arrays we collapse to inline JSON; nested objects are
  // rendered in their own paragraph block above (no recursion needed here).
  return JSON.stringify(value);
}

export function envelopeToSegments(
  envelope: IntentEnvelope,
): readonly JsonSegment[] {
  const payloadLines = formatPayloadBlock(envelope.payload, 2);
  const actor = envelope.actor as { principal?: string; sessionId?: string };
  const hashDisplay = truncMiddle(envelope.intentHash ?? "<unknown>", 16, 6);
  return [
    plain("{"),
    plain(`  version: ${envelope.version},`),
    plain(`  kind: ${literal(envelope.kind)},`),
    plain("  payload: {"),
    ...payloadLines.map(plain),
    plain("  },"),
    plain(
      `  actor: { principal: ${literal(actor?.principal ?? "")}, sessionId: ${literal(actor?.sessionId ?? "")} },`,
    ),
    hl("  taint: ", `"${envelope.taint}"`, ","),
    hl("  nonce: ", `"${truncMiddle(envelope.nonce, 14, 4)}"`, ","),
    hl("  intentHash: ", `"${hashDisplay}"`),
    plain("}"),
  ];
}

export function auditToSegments(
  record: AuditRecord,
): readonly JsonSegment[] {
  const hashDisplay = truncMiddle(record.intentHash ?? "<unknown>", 16, 6);
  return [
    plain("{"),
    plain(`  version: ${record.version},`),
    hl("  intentHash: ", `"${hashDisplay}"`, ","),
    plain("  envelope: { …see INPUT above… },"),
    plain(`  decision: { kind: ${literal(record.decision.kind)}, … },`),
    plain("  decision_basis: [ …see DECISION above… ],"),
    hl("  at: ", `"${record.at}"`, ","),
    hl("  durationMs: ", String(record.durationMs)),
    record.plan
      ? plain("  // plan: snapshot")
      : plain("  // plan: undefined"),
    plain("}"),
  ];
}

/** Format an object's keys as indented "key: value," lines (one level only). */
function formatPayloadBlock(value: unknown, indent: number): readonly string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [`${" ".repeat(indent + 2)}${literal(value)}`];
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  return keys.map(
    (k, i) =>
      `${" ".repeat(indent + 2)}${k}: ${literal(obj[k])}${i < keys.length - 1 ? "," : ""}`,
  );
}

/**
 * Shallow key diff of two payload objects. Returns two parallel arrays of
 * segments — one per card. Keys whose values changed are highlighted on
 * both sides (the visitor sees what was proposed and what replaced it).
 */
export function payloadDiffSegments(
  before: unknown,
  after: unknown,
): { readonly left: readonly JsonSegment[]; readonly right: readonly JsonSegment[] } {
  const left: JsonSegment[] = [plain("{")];
  const right: JsonSegment[] = [plain("{")];
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isObj(before) || !isObj(after)) {
    left.push(plain(`  ${literal(before)}`));
    right.push(plain(`  ${literal(after)}`));
    left.push(plain("}"));
    right.push(plain("}"));
    return { left, right };
  }
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  );
  keys.forEach((k, i) => {
    const beforeValue = before[k];
    const afterValue = after[k];
    const changed =
      JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
    const comma = i < keys.length - 1 ? "," : "";
    if (changed) {
      left.push(hl(`  ${k}: `, literal(beforeValue), comma));
      right.push(hl(`  ${k}: `, literal(afterValue), comma));
    } else {
      left.push(plain(`  ${k}: ${literal(beforeValue)}${comma}`));
      right.push(plain(`  ${k}: ${literal(afterValue)}${comma}`));
    }
  });
  left.push(plain("}"));
  right.push(plain("}"));
  return { left, right };
}

/** "86400000" → "24 hours"; "300000" → "5 minutes"; "1500" → "1.5 seconds". */
export function humaniseTimeoutMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 ms";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${rounded} second${rounded === 1 ? "" : "s"}`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    const rounded = Math.round(minutes * 10) / 10;
    return `${rounded} minute${rounded === 1 ? "" : "s"}`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded} hour${rounded === 1 ? "" : "s"}`;
  }
  const days = hours / 24;
  const rounded = Math.round(days * 10) / 10;
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

export { truncMiddle };
