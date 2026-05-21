/**
 * Tiny semver-range satisfier. Implements the subset used by Pack
 * manifests: `>=A`, `<B`, `>=A <B`, `^A`, `~A`, exact, and the special
 * `*` / `"any"` ranges. Returns `true` if `version` is in the range.
 *
 * The package deliberately avoids pulling `semver` (a heavy dep) because
 * the manifest-validation primitive should stay zero-cost to ship.
 * Adopters using a different range dialect (e.g., npm-cli's full
 * semver) can supply their own check and bypass this helper.
 *
 * Limitations: no pre-release coercion, no `||` OR-of-ranges, no `>` or
 * `<=` (use `>=` / `<` paired). For the small surface the manifest
 * schema uses today, these are sufficient.
 */

function parseVersion(v: string): [number, number, number] | null {
  const trimmed = v.trim().replace(/^v/, "");
  // Accept full X.Y.Z, X.Y (patch defaults to 0), and X (minor + patch
  // default to 0). Manifest authors write `">=0.5"` casually; coerce to
  // the same shape `parseVersion` returns for `"0.5.0"`.
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(trimmed);
  if (!m) return null;
  return [Number(m[1]!), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function cmp(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return 1;
    if (a[i]! < b[i]!) return -1;
  }
  return 0;
}

function bump(v: [number, number, number], op: "^" | "~"): [number, number, number] {
  if (op === "^") {
    if (v[0]! > 0) return [v[0]! + 1, 0, 0];
    if (v[1]! > 0) return [0, v[1]! + 1, 0];
    return [0, 0, v[2]! + 1];
  }
  // ~
  return [v[0]!, v[1]! + 1, 0];
}

export default function semverSatisfies(
  version: string,
  range: string,
): boolean {
  const v = parseVersion(version);
  if (!v) return false;
  const r = range.trim();
  if (r === "*" || r.toLowerCase() === "any") return true;

  // Compound `>=A <B` (possibly with whitespace).
  const parts = r.split(/\s+/).filter((s) => s.length > 0);
  for (const part of parts) {
    if (!checkSingle(v, part)) return false;
  }
  return true;
}

function checkSingle(
  v: [number, number, number],
  range: string,
): boolean {
  // ^A, ~A
  if (range.startsWith("^") || range.startsWith("~")) {
    const op = range[0] as "^" | "~";
    const base = parseVersion(range.slice(1));
    if (!base) return false;
    return cmp(v, base) >= 0 && cmp(v, bump(base, op)) < 0;
  }
  if (range.startsWith(">=")) {
    const base = parseVersion(range.slice(2));
    if (!base) return false;
    return cmp(v, base) >= 0;
  }
  if (range.startsWith("<=")) {
    const base = parseVersion(range.slice(2));
    if (!base) return false;
    return cmp(v, base) <= 0;
  }
  if (range.startsWith(">")) {
    const base = parseVersion(range.slice(1));
    if (!base) return false;
    return cmp(v, base) > 0;
  }
  if (range.startsWith("<")) {
    const base = parseVersion(range.slice(1));
    if (!base) return false;
    return cmp(v, base) < 0;
  }
  // Exact
  const base = parseVersion(range);
  if (!base) return false;
  return cmp(v, base) === 0;
}
