/**
 * The seven public transparency signals. One source of truth for the
 * /transparency index grid and the closing "other signals" nav on every
 * sub-view (so the cluster cross-links and never ends in a dead void).
 */
export interface TransparencySignal {
  readonly slug: string;
  readonly label: string;
  readonly blurb: string;
  /** Grouping on the index: the trust posture vs the operations rollups. */
  readonly group: "risk" | "operations";
}

export const TRANSPARENCY_SIGNALS: ReadonlyArray<TransparencySignal> = [
  {
    slug: "red-team",
    label: "Red-team defenses",
    blurb: "Which adversarial probes the guards catch — aggregate posture only.",
    group: "risk",
  },
  {
    slug: "drift",
    label: "Behavioral drift",
    blurb: "How often agent behavior shifts away from its established baseline.",
    group: "risk",
  },
  {
    slug: "integrity",
    label: "Configuration integrity",
    blurb: "Whether pack seals still verify and how stable the kill switch has been.",
    group: "risk",
  },
  {
    slug: "ai-bom",
    label: "AI bill-of-materials",
    blurb: "The models, packs, guards and adapters in the deployment.",
    group: "risk",
  },
  {
    slug: "pii",
    label: "PII handling",
    blurb: "How classified data is detected and redacted before any side-effect.",
    group: "operations",
  },
  {
    slug: "command-risk",
    label: "Command risk",
    blurb: "The risk distribution of shell-category commands — category only.",
    group: "operations",
  },
  {
    slug: "tokens",
    label: "Token governance",
    blurb: "How much of the period's token budget is used, as a coarse band.",
    group: "operations",
  },
];
