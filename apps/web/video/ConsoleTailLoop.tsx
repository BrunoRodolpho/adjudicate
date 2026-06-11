import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  COLORS,
  CONSOLE,
  Caption,
  ConsoleRow,
  type DecisionKind,
  DottedGrid,
  EASE_OUT,
  FONT_MONO,
  Grain,
  SECTION_CAPS_TRACKING,
  SHADOW,
  Vignette,
  fadeIn,
  seam,
} from "./components";

/**
 * ConsoleTailLoop — narrative step four: the operator console.
 *
 * On the dark CONSOLE canvas, signed audit receipts stream into an audit
 * explorer one at a time, newest at the top. Each arrival pushes the
 * existing rows down and lands with a highlight-on-arrival beat (the row
 * briefly lifts to the lighter CONSOLE.edge panel, then settles). The
 * decision-colored left rails are load-bearing identity — the operator
 * reads the column of colors as the mix of outcomes the guard produced.
 *
 * The stream is authored to loop cleanly: the set of rows on screen at the
 * last frame matches frame 0, and the seam fades in ~8 / out ~24.
 *
 * 8 seconds · 30fps · 1200×675 (16:9). Dark scene.
 *
 * Deterministic over `frame` (no wall-clock / random). Professional motion
 * bar: one expo-out easing system, weighted slide-in, soft dark depth,
 * grain + deep vignette grading.
 */

export const FPS = 30;
export const DURATION_FRAMES = 240; // 8 seconds
export const WIDTH = 1200;
export const HEIGHT = 675;

interface AuditEntry {
  readonly kind: DecisionKind;
  readonly time: string;
  readonly intentKind: string;
  readonly hash: string;
}

// The streaming ledger. Decisions are mixed so the color column reads as a
// real operator feed (REWRITE/REFUSE/ESCALATE/CONFIRM/EXECUTE/DEFER all
// appear). Listed oldest→newest; the composition arrives them in order and
// keeps the most-recent N on screen.
const STREAM: ReadonlyArray<AuditEntry> = [
  {
    kind: "execute",
    time: "11:32:01.004Z",
    intentKind: "search.index.refresh",
    hash: "sha256:1c7a…0d12",
  },
  {
    kind: "rewrite",
    time: "11:32:03.221Z",
    intentKind: "email.send.bulk",
    hash: "sha256:9f4c…c4f2",
  },
  {
    kind: "confirm",
    time: "11:32:05.870Z",
    intentKind: "billing.refund.issue",
    hash: "sha256:5b21…7e44",
  },
  {
    kind: "refuse",
    time: "11:32:08.421Z",
    intentKind: "db.table.drop",
    hash: "sha256:3a01…8a91",
  },
  {
    kind: "escalate",
    time: "11:32:11.560Z",
    intentKind: "iam.role.grant.admin",
    hash: "sha256:7d90…b3ce",
  },
  {
    kind: "defer",
    time: "11:32:14.118Z",
    intentKind: "deploy.release.promote",
    hash: "sha256:e44f…21aa",
  },
  {
    kind: "execute",
    time: "11:32:16.733Z",
    intentKind: "ticket.status.update",
    hash: "sha256:0a8c…9f37",
  },
  {
    kind: "rewrite",
    time: "11:32:19.402Z",
    intentKind: "file.export.customer",
    hash: "sha256:b612…4c80",
  },
];

// Layout.
const PANEL_X = WIDTH / 2;
const PANEL_W = 700;
const PANEL_TOP = 132;
const PANEL_H = 420;
const ROW_W = PANEL_W - 48;
const ROW_PITCH = 52; // vertical distance between row tops
const LIST_TOP = 64; // top padding inside panel, below chrome label
const VISIBLE = 6; // rows kept on screen

// Cadence: one new receipt arrives every ARRIVE_EVERY frames. Over the
// 240-frame loop that lands ~6 arrivals, matching VISIBLE so the visible
// set cycles by exactly one screen across the loop (clean seam).
const ARRIVE_EVERY = 40;
const ARRIVE_LEN = 16; // slide-in duration
const FRESH_HOLD = 18; // how long a row stays "fresh"-highlighted

export const ConsoleTailLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const seamOpacity = seam(frame, DURATION_FRAMES);

  // How many receipts have "arrived" by this frame (a real-valued count;
  // the integer part is settled rows, the fraction drives the topmost
  // arriving row's slide-in progress).
  const arrivals = frame / ARRIVE_EVERY;
  const arrivedCount = Math.floor(arrivals);
  // Progress [0,1] of the currently-arriving row, eased.
  const arriveRaw = arrivals - arrivedCount;
  const arriveProgress = interpolate(
    arriveRaw,
    [0, ARRIVE_LEN / ARRIVE_EVERY],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE_OUT,
    },
  );

  // Build the visible rows. Index 0 = topmost (newest / arriving). We map a
  // visible slot to a STREAM entry by modulo so the feed loops endlessly.
  // The arriving row (slot 0) slides down from above and fades in; the rows
  // beneath sit at their settled slots (the push-down is expressed by the
  // arriving row appearing above them as progress completes).
  const rows: Array<{
    entry: AuditEntry;
    slot: number;
    opacity: number;
    translateY: number;
    fresh: boolean;
  }> = [];

  for (let slot = 0; slot < VISIBLE; slot++) {
    // The newest settled receipt is (arrivedCount - 1); slot 0 is the
    // arriving one on top of it.
    const streamIndex = arrivedCount - slot;
    if (streamIndex < 0) continue;
    const entry = STREAM[((streamIndex % STREAM.length) + STREAM.length) % STREAM.length];

    if (slot === 0) {
      // Arriving row: slides down into place from -ROW_PITCH, fades in.
      const ty = interpolate(arriveProgress, [0, 1], [-ROW_PITCH * 0.6, 0]);
      rows.push({
        entry,
        slot,
        opacity: arriveProgress,
        translateY: ty,
        // Highlighted while fresh (the arrival beat).
        fresh: arriveRaw * ARRIVE_EVERY < FRESH_HOLD,
      });
    } else {
      rows.push({
        entry,
        slot,
        opacity: 1,
        translateY: 0,
        fresh: false,
      });
    }
  }

  return (
    <AbsoluteFill style={{ background: CONSOLE.canvas }}>
      {/* Inner wrapper carries the loop-seam opacity; canvas never fades. */}
      <AbsoluteFill style={{ opacity: seamOpacity }}>
        <DottedGrid
          frame={frame}
          total={DURATION_FRAMES}
          dark
          opacity={0.5}
        />

        {/* The audit-explorer panel. */}
        <div
          style={{
            position: "absolute",
            left: PANEL_X - PANEL_W / 2,
            top: PANEL_TOP,
            width: PANEL_W,
            height: PANEL_H,
            borderRadius: 16,
            background: CONSOLE.panel,
            border: `1px solid ${CONSOLE.edge}`,
            boxShadow: SHADOW.consolePanel,
            overflow: "hidden",
            opacity: fadeIn(frame, 0, 14),
          }}
        >
          {/* Chrome label bar. */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 44,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 18px",
              borderBottom: `1px solid ${CONSOLE.edge}`,
              background: CONSOLE.canvas,
            }}
          >
            {/* Window dots. */}
            <span
              style={{
                display: "inline-flex",
                gap: 6,
              }}
            >
              {[CONSOLE.faint, CONSOLE.faint, CONSOLE.faint].map((c, i) => (
                <span
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: c,
                    display: "inline-block",
                  }}
                />
              ))}
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: SECTION_CAPS_TRACKING,
                textTransform: "uppercase",
                color: CONSOLE.muted,
                fontWeight: 600,
              }}
            >
              Audit Explorer
            </span>
            {/* Live pulse dot on the right. */}
            <span
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: FONT_MONO,
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: CONSOLE.muted,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: COLORS.execute,
                  boxShadow: `0 0 8px ${COLORS.execute}`,
                  opacity:
                    0.55 +
                    0.45 * (0.5 + 0.5 * Math.sin((frame / 30) * Math.PI * 2)),
                }}
              />
              live
            </span>
          </div>

          {/* The streaming rows. */}
          <div style={{ position: "absolute", top: LIST_TOP, left: 24 }}>
            {rows.map((r) => (
              <div
                key={`${r.entry.hash}-${arrivedCount - r.slot}`}
                style={{
                  position: "absolute",
                  top: r.slot * ROW_PITCH,
                  left: 0,
                  transform: `translateY(${r.translateY}px)`,
                }}
              >
                <ConsoleRow
                  kind={r.entry.kind}
                  time={r.entry.time}
                  intentKind={r.entry.intentKind}
                  hash={r.entry.hash}
                  width={ROW_W}
                  opacity={r.opacity}
                  fresh={r.fresh}
                />
              </div>
            ))}
          </div>

          {/* Bottom fade so rows leaving the list dissolve, not clip. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 56,
              background: `linear-gradient(to bottom, transparent, ${CONSOLE.panel})`,
              pointerEvents: "none",
            }}
          />
        </div>

        <Caption
          frame={frame}
          eyebrow="Step 4 · The operator console"
          text="Saved receipts stream into the audit explorer, in real time."
          bottom={48}
          dark
          eyebrowColor={CONSOLE.muted}
          delay={6}
        />

        <Vignette dark />
        <Grain dark />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
