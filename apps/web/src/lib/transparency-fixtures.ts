/**
 * ILLUSTRATIVE sample data for the public PII transparency view — NOT live
 * production numbers. `apps/web` is a public, unauthenticated surface with no
 * database credentials, so its transparency pages render from this committed
 * fixture rather than from real governance results. The shape mirrors what a
 * real (authenticated) projection would produce: aggregate counts per
 * (sensitivity × disposition), with the public cohort floor applied at render
 * time. The spread below deliberately includes a small cohort (< 5) so the
 * floor / "<5" censoring is exercised on the page.
 */

/** Closed-enum sensitivity class for a PII aggregate row. */
export type PiiSensitivityLevel = "low" | "medium" | "high" | "critical";

/** Closed-enum disposition: how the sensitive field was handled. */
export type PiiDisposition = "redacted" | "blocked";

/** A single aggregate row: count of PII handlings for a (sensitivity, disposition). */
export interface PiiTransparencyRow {
  readonly sensitivityLevel: PiiSensitivityLevel;
  readonly disposition: PiiDisposition;
  readonly count: number;
}

/**
 * Illustrative PII aggregate sample. Realistic spread across sensitivity classes
 * and dispositions; `critical` × `redacted` is a small cohort (count 3) to
 * exercise the small-cohort floor on the public page.
 */
export const PII_TRANSPARENCY_SAMPLE: readonly PiiTransparencyRow[] = [
  { sensitivityLevel: "low", disposition: "redacted", count: 1842 },
  { sensitivityLevel: "low", disposition: "blocked", count: 7 },
  { sensitivityLevel: "medium", disposition: "redacted", count: 936 },
  { sensitivityLevel: "medium", disposition: "blocked", count: 58 },
  { sensitivityLevel: "high", disposition: "redacted", count: 214 },
  { sensitivityLevel: "high", disposition: "blocked", count: 41 },
  { sensitivityLevel: "critical", disposition: "redacted", count: 3 },
  { sensitivityLevel: "critical", disposition: "blocked", count: 29 },
];
