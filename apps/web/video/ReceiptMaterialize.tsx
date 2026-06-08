import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  AmbientGlow,
  COLORS,
  Caption,
  DecisionBadge,
  DottedGrid,
  EASE_OUT,
  FONT_MONO,
  Grain,
  ReceiptCard,
  type ReceiptRow,
  SECTION_CAPS_TRACKING,
  SHADOW,
  Vignette,
  fadeIn,
  rise,
  seam,
} from "./components";

/**
 * ReceiptMaterialize — narrative step three: the signed AuditRecord.
 *
 * A single auditRecord assembles field-by-field on the light canvas — the
 * version pins, the intentHash arrives, the decision resolves to REWRITE
 * (the load-bearing decision color), the basis[] reasons cascade, the
 * auditHash content-address seals, the signature lands, and finally a
 * "saved to Postgres" confirmation flips the sealed chip on. It ends
 * holding the full signed receipt, then fades on the loop seam.
 *
 * 6 seconds · 30fps · 1200×675 (16:9). Light scene.
 *
 * Beat schedule (frames @30fps):
 *   A. Card surface settles in        0–18    (0.0–0.6s)
 *   B. Fields cascade row-by-row     18–108   (0.6–3.6s)
 *   C. auditHash + signature seal   108–138   (3.6–4.6s)
 *   D. "saved to Postgres" + sealed 138–156   (4.6–5.2s)
 *   E. Hold + loop seam             156–180   (5.2–6.0s)
 *
 * Deterministic over `frame` (no wall-clock / random). Professional motion
 * bar: one expo-out easing system, weighted reveals, soft depth, grain +
 * vignette grading, clean loop seam (in ~8 / out ~24).
 */

export const FPS = 30;
export const DURATION_FRAMES = 180; // 6 seconds
export const WIDTH = 1200;
export const HEIGHT = 675;

const CARD_X = WIDTH / 2; // 600
const CARD_Y = 132;
const CARD_W = 560;

// The receipt's fields, revealed one per beat. The decision row is graded
// with the REWRITE color (identity stays authoritative in COLORS).
const ROWS: ReadonlyArray<ReceiptRow> = [
  { label: "version", value: "audit/v1" },
  { label: "intentHash", value: "sha256:9f4c…c4f2" },
  {
    label: "decision",
    value: "REWRITE",
    valueColor: COLORS.rewrite,
    valueWeight: 700,
  },
  { label: "basis[0]", value: "policy.pii.redact — email masked" },
  { label: "basis[1]", value: "policy.scope.narrow — prod → staging" },
  { label: "auditHash", value: "sha256:3a01…8a91" },
  { label: "signature", value: "ed25519:kernel-prod-07" },
];

// Frame each row begins its reveal. Tight, frame-accurate stagger so the
// receipt "writes itself" at a readable cadence.
const ROW_START = [18, 34, 50, 68, 84, 104, 120] as const;
const ROW_LEN = 14;

// The hash content-address foot line seals after the body rows.
const HASH_START = 120;
// "saved to Postgres" confirmation + sealed chip.
const SAVED_START = 138;

export const ReceiptMaterialize: React.FC = () => {
  const frame = useCurrentFrame();
  const seamOpacity = seam(frame, DURATION_FRAMES);

  // Card surface settles in first (soft rise + fade).
  const cardOpacity = fadeIn(frame, 0, 16);
  const cardTy = rise(frame, 0, 22, 14);

  // Per-row cascade opacity.
  const rowOpacity = (i: number): number =>
    fadeIn(frame, ROW_START[i] ?? 0, ROW_LEN);

  // Foot hash line reveal.
  const hashShown = frame >= HASH_START;

  // Sealed chip flips on with the "saved" confirmation.
  const sealedOpacity = fadeIn(frame, SAVED_START, 12);

  // The "saved to Postgres" confirmation chip below the card.
  const savedOpacity = fadeIn(frame, SAVED_START, 14);
  const savedTy = rise(frame, SAVED_START, 18, 10);

  return (
    <AbsoluteFill style={{ background: COLORS.canvas }}>
      {/* Inner wrapper carries the loop-seam opacity; canvas never fades. */}
      <AbsoluteFill style={{ opacity: seamOpacity }}>
        <DottedGrid frame={frame} total={DURATION_FRAMES} opacity={0.35} />
        <AmbientGlow
          frame={frame}
          total={DURATION_FRAMES}
          x={CARD_X}
          y={CARD_Y + 180}
          size={760}
          inner="rgba(249,115,22,0.10)"
          outer="rgba(99,102,241,0.04)"
          opacity={0.7}
          blur={36}
        />

        {/* Eyebrow above the card. */}
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 0,
            right: 0,
            textAlign: "center",
            opacity: fadeIn(frame, 0, 14),
            transform: `translateY(${rise(frame, 0, 16, 8)}px)`,
          }}
        >
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: COLORS.muted,
              letterSpacing: SECTION_CAPS_TRACKING,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Step 3 · The signed receipt
          </span>
        </div>

        <ReceiptCard
          x={CARD_X}
          y={CARD_Y}
          width={CARD_W}
          opacity={cardOpacity}
          translateY={cardTy}
          rows={ROWS}
          rowOpacity={rowOpacity}
          hash={hashShown ? "auditHash · sha256:3a01…8a91" : undefined}
          title="auditRecord"
          sealedOpacity={sealedOpacity}
          sealedLabel="sealed"
        />

        {/* Floating decision badge that lands beside the card when the
            decision row reveals — reinforces the REWRITE identity color. */}
        <div
          style={{
            position: "absolute",
            top: CARD_Y + 16,
            left: CARD_X + CARD_W / 2 + 24,
          }}
        >
          <DecisionBadge
            kind="rewrite"
            size="md"
            opacity={fadeIn(frame, ROW_START[2], 12)}
            scale={interpolate(
              frame,
              [ROW_START[2], ROW_START[2] + 14],
              [0.9, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE_OUT,
              },
            )}
          />
        </div>

        {/* "saved to Postgres" confirmation chip below the card. */}
        <div
          style={{
            position: "absolute",
            top: CARD_Y + 350,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: savedOpacity,
            transform: `translateY(${savedTy}px)`,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 12,
              background: COLORS.surface,
              border: `1px solid ${COLORS.edge}`,
              boxShadow: SHADOW.card,
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: COLORS.execute,
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            <span aria-hidden style={{ fontWeight: 700 }}>
              ⛁
            </span>
            saved to Postgres · audit_records
          </span>
        </div>

        <Caption
          frame={frame}
          eyebrow="auditRecord · audit/v1"
          text="Every decision becomes a signed, content-addressed receipt."
          bottom={48}
          eyebrowColor={COLORS.rewrite}
          delay={SAVED_START - 6}
        />

        <Vignette />
        <Grain />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
