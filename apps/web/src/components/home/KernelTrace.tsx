"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * KernelTrace — the homepage centerpiece. A LIVE execution trace, not a video:
 * the constitutional kernel deciding real scenarios in real time. An intent
 * enters on the left, flows top-to-bottom through the six ordered guards, and
 * resolves to one of the six outcomes on the right — optionally minting a
 * capability, holding for confirmation, rewriting, refusing, or escalating. It cycles five
 * scenarios so a visitor watches the kernel PROVE itself.
 *
 * Reduced-motion: renders the first scenario fully resolved, statically.
 *
 * This is a teaching instrument. The load-bearing truths it shows: guards run
 * in a fixed order and short-circuit; risk can only escalate (never authorize);
 * the default is refuse (fail-closed); every decision is one of exactly six.
 */

type OutcomeKey =
  | "execute"
  | "confirm"
  | "rewrite"
  | "refuse"
  | "escalate";

interface GuardState {
  /** Mono label for the guard row. */
  readonly label: string;
  /** Resolved status text (the pass wording when this scenario clears it). */
  readonly pass: string;
}

/** The six ordered guards, in evaluation order. */
const GUARDS: ReadonlyArray<GuardState> = [
  { label: "intentHash", pass: "verified" },
  { label: "provenance", pass: "clean" },
  { label: "ownership", pass: "owner ✓" },
  { label: "limits", pass: "within" },
  { label: "risk", pass: "nominal" },
  { label: "decision", pass: "authorize" },
];

interface Scenario {
  readonly intentKind: string;
  readonly fields: ReadonlyArray<readonly [string, string]>;
  readonly origin: string;
  readonly taint: "TRUSTED" | "UNTRUSTED";
  /**
   * 1-based index of the guard that decides this scenario (emits the outcome).
   * 0 = no guard trips; all clear → EXECUTE.
   */
  readonly decisive: number;
  /** The status word shown on the deciding guard when it trips. */
  readonly trip?: string;
  readonly outcome: OutcomeKey;
  /** One-line consequence shown beneath the outcome. */
  readonly effect: string;
  /** Optional capability the EXECUTE verdict can carry — off by default. */
  readonly capability?: { readonly resource: string; readonly ttl: string; readonly budget: string };
}

const SCENARIOS: ReadonlyArray<Scenario> = [
  {
    intentKind: "payments.transfer",
    fields: [["to", "Vendor A"], ["amount", "$250.00"]],
    origin: "LLM",
    taint: "UNTRUSTED",
    decisive: 0,
    outcome: "execute",
    effect: "Cleared to EXECUTE — optionally carried as a single-use capability that expires after one action.",
    capability: { resource: "payments.transfer", ttl: "60s", budget: "$500" },
  },
  {
    intentKind: "treasury.wire",
    fields: [["to", "acct ••8841"], ["amount", "$75,000.00"]],
    origin: "Human",
    taint: "TRUSTED",
    decisive: 4,
    trip: "over cap",
    outcome: "confirm",
    effect: "Above the $50k limit — held for out-of-band human approval.",
  },
  {
    intentKind: "support.reply",
    fields: [["source", "retrieved doc"], ["body", "“…ignore policy…”"]],
    origin: "Retrieved",
    taint: "UNTRUSTED",
    decisive: 2,
    trip: "contaminated",
    outcome: "rewrite",
    effect: "Injected instruction stripped; a safe reply is re-adjudicated.",
  },
  {
    intentKind: "accounts.close",
    fields: [["resource", "acct-1042"], ["claims", "owner"]],
    origin: "LLM",
    taint: "UNTRUSTED",
    decisive: 3,
    trip: "no edge",
    outcome: "refuse",
    effect: "No ownership edge backs the claim — refused, fail-closed.",
  },
  {
    intentKind: "identity.kyc.approve",
    fields: [["subject", "p-7731"], ["match", "sanctions"]],
    origin: "ExternalAPI",
    taint: "UNTRUSTED",
    decisive: 5,
    trip: "sanctions",
    outcome: "escalate",
    effect: "Risk can only escalate — never authorize. Routed to Adjudicant.",
  },
];

const OUTCOME_META: Record<OutcomeKey, { label: string; hex: string; cls: string }> = {
  execute: { label: "EXECUTE", hex: "#10B981", cls: "text-execute" },
  confirm: { label: "REQUEST_CONFIRMATION", hex: "#0EA5E9", cls: "text-confirm" },
  rewrite: { label: "REWRITE", hex: "#F97316", cls: "text-rewrite" },
  refuse: { label: "REFUSE", hex: "#EF4444", cls: "text-refuse" },
  escalate: { label: "ESCALATE", hex: "#8B5CF6", cls: "text-escalate" },
};

// Stage timeline within a scenario: 0 intent, 1..6 guards, 7 outcome,
// 8 effect/capability, 9-10 hold, then advance.
const STAGES = 11;
const STAGE_MS = 560;

export function KernelTrace() {
  const reduce = useReducedMotion();
  const [si, setSi] = useState(0);
  const [stage, setStage] = useState(reduce ? STAGES - 1 : 0);
  const frozen = useRef(false);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setStage((s) => {
        if (frozen.current) return s;
        if (s >= STAGES - 1) {
          setSi((p) => (p + 1) % SCENARIOS.length);
          return 0;
        }
        return s + 1;
      });
    }, STAGE_MS);
    return () => clearInterval(id);
  }, [reduce]);

  const scenario = SCENARIOS[si] ?? SCENARIOS[0]!;
  const o = OUTCOME_META[scenario.outcome];
  const outcomeShown = stage >= 7;
  const effectShown = stage >= 8;

  // Resolve each guard row's display state for the current scenario + stage.
  const rows = GUARDS.map((g, idx) => {
    const i = idx + 1; // 1-based
    const revealed = stage >= i;
    const d = scenario.decisive;
    let status: "pending" | "pass" | "trip" | "skip" = "pending";
    let text = "";
    if (revealed) {
      if (d === 0 || i < d) {
        status = "pass";
        text = g.pass;
      } else if (i === d) {
        status = "trip";
        text = scenario.trip ?? "halt";
      } else {
        status = "skip";
        text = "— short-circuit";
      }
    }
    const active = !reduce && stage === i; // currently resolving
    return { key: g.label, label: g.label, status, text, active };
  });

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-console-edge bg-console-canvas"
      onMouseEnter={() => (frozen.current = true)}
      onMouseLeave={() => (frozen.current = false)}
      style={{
        boxShadow:
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 30px 80px -20px rgba(0,0,0,0.7)",
      }}
    >
      {/* faint dotted grid + top sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: "radial-gradient(rgb(39 39 42) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32"
        style={{
          background: `radial-gradient(60% 100% at 50% 0%, ${o.hex}22, transparent)`,
          transition: "background 600ms ease",
        }}
      />

      {/* terminal chrome */}
      <div className="relative flex items-center justify-between border-b border-console-edge px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#3f3f46]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#3f3f46]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#3f3f46]" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-console-muted">
            adjudicate · constitutional kernel
          </span>
        </div>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-execute">
          <span className="relative flex h-2 w-2">
            {!reduce && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-execute opacity-60" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-execute" />
          </span>
          live
        </span>
      </div>

      {/* body: intent | kernel | outcome */}
      <div className="relative grid gap-px bg-console-edge md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* INTENT */}
        <div className="bg-console-canvas p-5">
          <Eyebrow>intent · proposed</Eyebrow>
          <div className="mt-3 rounded-lg border border-console-edge bg-console-panel p-3 font-mono text-[12px] leading-relaxed">
            <div className="text-console-ink">{scenario.intentKind}</div>
            {scenario.fields.map(([k, v]) => (
              <div key={k} className="text-console-muted">
                <span className="text-console-faint">{k}:</span>{" "}
                <span className="text-console-ink">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
            <Tag>origin: {scenario.origin}</Tag>
            <Tag tone={scenario.taint === "UNTRUSTED" ? "warn" : "ok"}>
              taint: {scenario.taint}
            </Tag>
          </div>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-console-faint">
            the LLM can only propose. it never authorizes.
          </p>
        </div>

        {/* KERNEL — the six ordered guards */}
        <div className="bg-console-canvas p-5">
          <Eyebrow>kernel · ordered guards</Eyebrow>
          <ul className="mt-3 flex flex-col gap-1.5">
            {rows.map((r, idx) => (
              <GuardRow
                key={r.key}
                index={idx + 1}
                label={r.label}
                status={r.status}
                text={r.text}
                active={r.active}
                accent={o.hex}
              />
            ))}
          </ul>
          <p className="mt-3 font-mono text-[10px] text-console-faint">
            default = refuse · fail-closed
          </p>
        </div>

        {/* OUTCOME */}
        <div className="flex flex-col bg-console-canvas p-5">
          <Eyebrow>decision · 1 of 6</Eyebrow>
          <div
            className="mt-3 rounded-lg border p-4 transition-all duration-500"
            style={{
              borderColor: outcomeShown ? `${o.hex}66` : "#27272a",
              background: outcomeShown ? `${o.hex}14` : "transparent",
              opacity: outcomeShown ? 1 : 0.35,
            }}
          >
            <div
              className="font-mono text-[15px] font-semibold tracking-tight transition-colors duration-500"
              style={{ color: outcomeShown ? o.hex : "#52525b" }}
            >
              {outcomeShown ? o.label : "evaluating…"}
            </div>
            <p className="mt-2 min-h-[48px] text-[12px] leading-relaxed text-console-muted">
              {effectShown ? scenario.effect : ""}
            </p>
          </div>

          {/* capability / audit trailer */}
          <div className="mt-3 flex flex-col gap-2">
            {scenario.capability ? (
              <TrailerCard show={effectShown} accent={o.hex} title="capability · off by default">
                <span className="text-console-faint">resource</span> {scenario.capability.resource}
                {"  "}
                <span className="text-console-faint">ttl</span> {scenario.capability.ttl}
                {"  "}
                <span className="text-console-faint">budget</span> {scenario.capability.budget}
              </TrailerCard>
            ) : null}
            <TrailerCard show={effectShown} accent="#3f3f46" title="audit appended">
              <span className="text-console-faint">⛓</span> sha256:
              {scenario.outcome.slice(0, 2)}
              {(si * 7 + 11).toString(16)}…
              {(si * 13 + 41).toString(16)} · replayable
            </TrailerCard>
          </div>
        </div>
      </div>

      {/* scenario ticker */}
      <div className="relative flex items-center justify-between border-t border-console-edge px-4 py-2.5">
        <div className="flex gap-1.5">
          {SCENARIOS.map((_, i) => (
            <span
              key={i}
              className="h-1 rounded-full transition-all duration-300"
              style={{
                width: i === si ? 22 : 6,
                background: i === si ? o.hex : "#3f3f46",
              }}
            />
          ))}
        </div>
        <span className="font-mono text-[10px] text-console-faint">
          {reduce ? "scenario 1 of 5" : `scenario ${si + 1} of 5 · hover to pause`}
        </span>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-console-faint">
      {children}
    </span>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" }) {
  const cls =
    tone === "warn"
      ? "border-defer/40 bg-defer/10 text-defer"
      : tone === "ok"
        ? "border-execute/40 bg-execute/10 text-execute"
        : "border-console-edge bg-console-panel text-console-muted";
  return (
    <span className={`rounded border px-1.5 py-0.5 ${cls}`}>{children}</span>
  );
}

function GuardRow({
  index,
  label,
  status,
  text,
  active,
  accent,
}: {
  index: number;
  label: string;
  status: "pending" | "pass" | "trip" | "skip";
  text: string;
  active: boolean;
  accent: string;
}) {
  const dot =
    status === "pass"
      ? "#10B981"
      : status === "trip"
        ? accent
        : status === "skip"
          ? "#3f3f46"
          : "#27272a";
  const labelColor =
    status === "pending" ? "text-console-faint" : "text-console-ink";
  const textColor =
    status === "pass"
      ? "text-execute"
      : status === "trip"
        ? ""
        : "text-console-faint";
  return (
    <li
      className="flex items-center gap-3 rounded-md border px-2.5 py-1.5 transition-all duration-300"
      style={{
        borderColor: active ? `${accent}66` : "#27272a",
        background: active ? `${accent}10` : "rgba(24,24,27,0.6)",
        boxShadow: active ? `0 0 0 1px ${accent}33, 0 8px 20px -12px ${accent}` : "none",
      }}
    >
      <span className="font-mono text-[10px] text-console-faint">{index}</span>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300"
        style={{ background: dot }}
      />
      <span className={`min-w-[78px] font-mono text-[12px] ${labelColor}`}>{label}</span>
      <span
        className={`ml-auto font-mono text-[11px] ${textColor}`}
        style={status === "trip" ? { color: accent } : undefined}
      >
        {text || (status === "pending" ? "" : "")}
      </span>
    </li>
  );
}

function TrailerCard({
  show,
  accent,
  title,
  children,
}: {
  show: boolean;
  accent: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border border-console-edge bg-console-panel px-3 py-2 transition-all duration-500"
      style={{ opacity: show ? 1 : 0.25, transform: show ? "none" : "translateY(4px)" }}
    >
      <div
        className="font-mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: accent === "#3f3f46" ? "#71717a" : accent }}
      >
        {title}
      </div>
      <div className="mt-0.5 font-mono text-[10px] leading-relaxed text-console-muted">
        {children}
      </div>
    </div>
  );
}
