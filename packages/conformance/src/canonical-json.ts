/**
 * Canonical-JSON serializer (RFC 8785 JCS subset) shared by pack-trust and
 * config-seal. Keys sorted by code-unit order; undefined omitted; only JSON
 * value types accepted. Kept dependency-free so trust/seal verification has zero
 * dependency on @adjudicate/core.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        `canonicalJson: non-finite number not representable (got ${value})`,
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${canonicalJson(v)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported value type (${typeof value})`);
}
