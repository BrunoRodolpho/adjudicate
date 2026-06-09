import { AbsoluteFill } from "remotion";
import { COLORS, FONT_MONO, FONT_SANS, GRADIENT_PRIMARY } from "../tokens";

/**
 * Per-capability OG image (1200×630) — a PARAMETERIZED single-frame still.
 *
 * Unlike the per-route OG compositions (HomepageOG, CapabilitiesOG, …) which
 * are fixed, this one is templated: `scripts/render-capability-og.ts` loops the
 * 14 entries in the {@link CAPABILITIES} registry and renders one PNG each via
 * `remotion still … --props=<json>`, landing in
 * `apps/web/public/og/capabilities/<slug>.png`. The result is wired into the
 * /capabilities/[slug] route's `openGraph.images` so each capability shares
 * with its own card.
 *
 * Card anatomy, matching the existing OG system (COLORS.canvas + a
 * gradient-primary blur blob, mono eyebrow, large name, family tag, decision
 * dots, an ADR badge + tier marker, and a footer URL).
 */

export interface CapabilityDetailOGProps {
  readonly name: string;
  readonly family: string;
  readonly oneLiner: string;
  readonly outcomes: ReadonlyArray<string>;
  readonly adrId: string;
  readonly tier: number;
  readonly pkgName: string;
  readonly slug: string;
}

/**
 * Map a decision-outcome string (the uppercase `DecisionKind` the registry
 * stores) to its load-bearing decision-token color. `REQUEST_CONFIRMATION`
 * maps to the `confirm` token; everything else lower-cases to a COLORS key.
 * Unknown strings fall back to the faint edge color so a typo never crashes
 * the render.
 */
const OUTCOME_COLORS: Record<string, string> = {
  EXECUTE: COLORS.execute,
  REFUSE: COLORS.refuse,
  REWRITE: COLORS.rewrite,
  DEFER: COLORS.defer,
  ESCALATE: COLORS.escalate,
  REQUEST_CONFIRMATION: COLORS.confirm,
};

function outcomeColor(outcome: string): string {
  return OUTCOME_COLORS[outcome] ?? COLORS.faint;
}

/** Human-facing family label for the four capability families. */
const FAMILY_LABELS: Record<string, string> = {
  "content-safety": "Content & data safety",
  adversarial: "Adversarial & behavioral",
  "budget-integrity": "Budget & integrity",
  workflow: "Workflow & governance",
};

function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family;
}

export const CapabilityDetailOG: React.FC<CapabilityDetailOGProps> = ({
  name,
  family,
  oneLiner,
  outcomes,
  adrId,
  tier,
  pkgName,
  slug,
}) => {
  return (
    <AbsoluteFill
      style={{ backgroundColor: COLORS.canvas, fontFamily: FONT_SANS }}
    >
      {/* Gradient-primary blur blob for depth, matching the OG system. */}
      <div
        style={{
          position: "absolute",
          top: -190,
          right: -170,
          width: 580,
          height: 580,
          borderRadius: "50%",
          background: GRADIENT_PRIMARY,
          opacity: 0.16,
          filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 80,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* Eyebrow + family tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: COLORS.muted,
            }}
          >
            adjudicate · capabilities
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 16,
              letterSpacing: "0.06em",
              color: COLORS.muted,
              padding: "8px 16px",
              borderRadius: 999,
              border: `2px solid ${COLORS.edge}`,
              background: COLORS.surface,
            }}
          >
            {familyLabel(family)}
          </div>
        </div>

        {/* Capability name + one-liner */}
        <div>
          <h1
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.04,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: "-0.02em",
              maxWidth: 980,
            }}
          >
            {name}
          </h1>
          <p
            style={{
              marginTop: 24,
              fontSize: 26,
              lineHeight: 1.42,
              color: COLORS.muted,
              maxWidth: 900,
            }}
          >
            {oneLiner}
          </p>

          {/* Decision-outcome dots, colored by the six decision tokens. */}
          <div
            style={{
              marginTop: 34,
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            {outcomes.map((outcome) => {
              const color = outcomeColor(outcome);
              return (
                <div
                  key={outcome}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 16px 8px 12px",
                    borderRadius: 999,
                    background: COLORS.surface,
                    border: `2px solid ${COLORS.edge}`,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: color,
                      boxShadow: `0 0 0 5px ${color}26`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 15,
                      letterSpacing: "0.04em",
                      color: COLORS.ink,
                    }}
                  >
                    {outcome}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ADR badge + tier marker + package, with the footer URL. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                fontWeight: 500,
                color: "white",
                padding: "8px 16px",
                borderRadius: 10,
                background: GRADIENT_PRIMARY,
                boxShadow: "0 6px 20px rgba(99,102,241,0.32)",
              }}
            >
              {adrId}
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                color: COLORS.ink,
                padding: "8px 16px",
                borderRadius: 10,
                border: `2px solid ${COLORS.edge}`,
                background: COLORS.surface,
              }}
            >
              {tier === 1 ? "Tier 1 · shipped" : `Tier ${tier}`}
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 16,
                color: COLORS.muted,
              }}
            >
              {pkgName}
            </span>
          </div>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 18,
              color: COLORS.ink,
            }}
          >
            adjudicate.dev/capabilities/{slug}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Default props — a real capability (pii-guard) so the composition renders a
 * representative card in the Remotion studio without external wiring.
 */
export const capabilityDetailDefaultProps: CapabilityDetailOGProps = {
  name: "PII / data-classification guard",
  family: "content-safety",
  oneLiner:
    "Detects classified data (SSNs, cards, secrets) in an intent and REWRITEs the payload to mask it — taint preserved.",
  outcomes: ["REWRITE", "EXECUTE", "REFUSE"],
  adrId: "ADR-117",
  tier: 1,
  pkgName: "@adjudicate/primitives",
  slug: "pii-guard",
};
