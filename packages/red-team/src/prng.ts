/**
 * Tiny seeded PRNG — copied (not imported) from @adjudicate/conformance so the
 * red-team package carries no runtime dependency beyond @adjudicate/core. Same
 * 32-bit LCG, so the same seed yields byte-identical sequences across runs.
 *
 * Determinism contract: no `Math.random()` is reachable from this package.
 */

export type Rng = () => number;

export function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function pick<T>(rng: Rng, xs: ReadonlyArray<T>): T {
  if (xs.length === 0) throw new Error("pick(): empty array");
  return xs[Math.floor(rng() * xs.length)]!;
}

/** UUIDv4-shaped, deterministic nonce (not cryptographic). */
export function deterministicNonce(rng: Rng): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i += 1) {
    s += hex[Math.floor(rng() * 16)];
    if (i === 7 || i === 11 || i === 15 || i === 19) s += "-";
  }
  return s;
}

/** Deterministic ISO-8601 timestamp within a fixed day window. */
export function deterministicTimestamp(rng: Rng): string {
  const minuteOffset = Math.floor(rng() * 1440);
  const baseMs = Date.UTC(2026, 4, 18, 0, 0, 0, 0);
  return new Date(baseMs + minuteOffset * 60_000).toISOString();
}

/** Default seed for the red-team suite. Fixed so CI runs are reproducible. */
export const RED_TEAM_DEFAULT_SEED = 0xed7ea;
