/**
 * Total-variation distance between two categorical distributions given as count
 * maps. Bounded [0,1], deterministic, defined on disjoint key sets (unlike
 * KL-divergence). `TVD = 0.5 * Σ |p_i − q_i|` over the union of keys, where each
 * distribution is normalized to proportions. Both-empty → 0; one-empty → 1.
 */
export function totalVariationDistance(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): number {
  const sumA = Object.values(a).reduce((s, n) => s + n, 0);
  const sumB = Object.values(b).reduce((s, n) => s + n, 0);
  if (sumA === 0 && sumB === 0) return 0;
  if (sumA === 0 || sumB === 0) return 1;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let acc = 0;
  for (const k of keys) {
    const pa = (a[k] ?? 0) / sumA;
    const pb = (b[k] ?? 0) / sumB;
    acc += Math.abs(pa - pb);
  }
  return acc / 2;
}
