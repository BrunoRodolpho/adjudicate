import { AbsoluteFill } from "remotion";
import {
  CONSOLE,
  DECISIONS,
  type DecisionKind,
  FONT_MONO,
  FONT_SANS,
  GRADIENT_PRIMARY,
} from "../tokens";

/**
 * /console OG — the dark operator console (audit explorer). A stack of
 * saved-receipt rows with decision-colored rails, mono timestamps, and
 * truncated content-address hashes. The final narrative step: signed
 * receipts displayed for an operator. Dark CONSOLE namespace.
 */

const ROWS: ReadonlyArray<{
  kind: DecisionKind;
  time: string;
  intent: string;
  hash: string;
}> = [
  {
    kind: "execute",
    time: "11:32:08.421Z",
    intent: "payments.pix.transfer",
    hash: "sha256:3a01…8a91",
  },
  {
    kind: "rewrite",
    time: "11:32:06.118Z",
    intent: "deployments.approval.request",
    hash: "sha256:b7e2…41cd",
  },
  {
    kind: "refuse",
    time: "11:32:01.907Z",
    intent: "identity.kyc.override",
    hash: "sha256:09fa…2b6e",
  },
  {
    kind: "escalate",
    time: "11:31:58.244Z",
    intent: "payments.pix.refund",
    hash: "sha256:cc18…7f30",
  },
  {
    kind: "confirm",
    time: "11:31:52.660Z",
    intent: "deployments.rollout.promote",
    hash: "sha256:5d44…a012",
  },
];

export const ConsoleOG: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: CONSOLE.canvas, fontFamily: FONT_SANS }}>
      <div
        style={{
          position: "absolute",
          top: -200,
          left: -180,
          width: 560,
          height: 560,
          borderRadius: "50%",
          background: GRADIENT_PRIMARY,
          opacity: 0.16,
          filter: "blur(90px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 80,
          display: "flex",
          alignItems: "center",
          gap: 60,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: CONSOLE.muted,
              marginBottom: 28,
            }}
          >
            adjudicate · console
          </div>
          <h1
            style={{
              fontSize: 70,
              fontWeight: 700,
              lineHeight: 1.05,
              color: CONSOLE.ink,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Every decision,
            <br />
            <span
              style={{
                background: GRADIENT_PRIMARY,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              on the record.
            </span>
          </h1>
          <p
            style={{
              marginTop: 22,
              fontSize: 23,
              lineHeight: 1.4,
              color: CONSOLE.muted,
              maxWidth: 420,
            }}
          >
            A signed receipt for each action, searchable and replayable in the
            operator console.
          </p>
        </div>
        <div
          style={{
            width: 560,
            flexShrink: 0,
            borderRadius: 18,
            background: CONSOLE.panel,
            border: `1px solid ${CONSOLE.edge}`,
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 13,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: CONSOLE.faint,
              }}
            >
              audit explorer
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 12,
                color: CONSOLE.faint,
              }}
            >
              {ROWS.length} receipts
            </span>
          </div>
          {ROWS.map((r) => (
            <ConsoleRowStill key={r.hash} {...r} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ConsoleRowStill: React.FC<{
  kind: DecisionKind;
  time: string;
  intent: string;
  hash: string;
}> = ({ kind, time, intent, hash }) => {
  const { label, color } = DECISIONS[kind];
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 16px 12px 20px",
        borderRadius: 10,
        background: CONSOLE.canvas,
        border: `1px solid ${CONSOLE.edge}`,
        fontFamily: FONT_MONO,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: color,
        }}
      />
      <span style={{ fontSize: 12, color: CONSOLE.faint, flexShrink: 0 }}>
        {time}
      </span>
      <span
        style={{
          fontSize: 13,
          color: CONSOLE.ink,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {intent}
      </span>
      <span
        style={{
          fontSize: 11,
          color,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12, color: CONSOLE.muted, flexShrink: 0 }}>
        {hash}
      </span>
    </div>
  );
};
