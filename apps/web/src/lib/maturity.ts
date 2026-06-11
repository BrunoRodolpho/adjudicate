/**
 * The single maturity vocabulary shared by capabilities and recipes.
 *
 * Both surfaces ultimately answer one question — is what you're shown backed by
 * the REAL kernel (run server-side / a live projection), or an illustrative
 * projection from public sample data? This replaces the old split where
 * capabilities said "Tier 1 / Tier 2" and recipes said "Live / Illustrative"
 * for the same underlying distinction (WS-I).
 */
export interface MaturityBadge {
  readonly label: string;
  /** Maps onto the shipped/roadmap Badge tones. */
  readonly tone: "shipped" | "roadmap";
}

export function maturityFor(realKernel: boolean): MaturityBadge {
  return realKernel
    ? { label: "Live · real kernel", tone: "shipped" }
    : { label: "Illustrative", tone: "roadmap" };
}
