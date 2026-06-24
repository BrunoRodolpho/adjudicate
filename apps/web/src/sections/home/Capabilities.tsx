import { ArrowRight, KeyRound, Timer } from "lucide-react";

/**
 * Capabilities — ACT 3 of the dark marketing homepage.
 *
 * The thesis: Adjudicate does not hand out permissions, it MINTS capabilities.
 * Authorization is not a standing grant attached to an identity; it is a single,
 * bound, budgeted, expiring token minted per decision and burned on use.
 *
 * The visual is a side-by-side compare: the legacy "API key → everything" model
 * (broad, standing, ambient, long-lived) against the Adjudicate model
 * (bound to one intentHash, single-use, budgeted, short TTL), followed by the
 * literal shape of a minted capability.
 *
 * Server component — purely presentational, no interactivity. Tokens and
 * vocabulary mirror {@link Hero} and {@link KernelTrace} exactly.
 */
export function Capabilities() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      {/* one restrained execute-tinted glow, low-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-6%] top-[8%] h-[440px] w-[640px] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(16,185,129,0.12), rgba(16,185,129,0.03), transparent)",
          filter: "blur(36px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* header */}
        <header className="flex max-w-2xl flex-col gap-5">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-console-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-execute" />
            Capabilities, not permissions
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
            Authorization is minted per decision —{" "}
            <span className="text-execute">then it expires.</span>
          </h2>
          <p className="max-w-2xl text-base leading-relaxed text-console-muted md:text-lg">
            Nothing carries a standing right to act. Each cleared decision mints
            one capability — bound to a single intent, single-use, budgeted, and
            short-lived. Spend it or it lapses.
          </p>
        </header>

        {/* compare cards */}
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <CompareCard
            tone="legacy"
            eyebrow="traditional · ambient authority"
            icon={<KeyRound size={16} aria-hidden="true" />}
            flow={["User", "API key", "everything"]}
            bullets={[
              ["broad", "one key, every resource"],
              ["standing", "valid until rotated"],
              ["ambient", "authority follows the caller"],
              ["long-lived", "TTL measured in months"],
            ]}
          />
          <CompareCard
            tone="adjudicate"
            eyebrow="adjudicate · minted capability"
            icon={<Timer size={16} aria-hidden="true" />}
            flow={["Decision", "signed capability", "single action", "expires"]}
            bullets={[
              ["bound to one intentHash", "useless for any other intent"],
              ["single-use", "burned the moment it is spent"],
              ["budgeted", "a hard limit, decremented per use"],
              ["short TTL", "seconds, not months"],
            ]}
          />
        </div>

        {/* the literal capability shape */}
        <div className="mt-4 overflow-hidden rounded-xl border border-console-edge bg-console-panel">
          <div className="flex items-center justify-between border-b border-console-edge px-5 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-console-faint">
              capability · minted shape
            </span>
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-execute">
              <span className="h-1.5 w-1.5 rounded-full bg-execute" />
              single-use
            </span>
          </div>
          <div className="bg-console-canvas p-5">
            <pre className="overflow-x-auto font-mono text-[12px] leading-relaxed text-console-muted">
              <code>{CAPABILITY_SHAPE}</code>
            </pre>
          </div>
        </div>

        {/* truthfulness caveat */}
        <p className="mt-4 max-w-3xl font-mono text-[11px] leading-relaxed text-console-faint">
          Hash-bound in the kernel (constant-time verify); ed25519 signatures
          when the node-side approval-engine signer is wired.
        </p>
      </div>
    </section>
  );
}

/** The shape of a minted capability, rendered as static mono. */
const CAPABILITY_SHAPE = `{
  intentHash: "0x9af2…c41b",
  boundTo:    "payments.transfer",
  budget:     { limit: 50000, spent: 250 },
  alg:        "sha256-hashbind",
  expiresAt:  "2026-06-19T14:32:07Z"
}`;

/* ------------------------------------------------------------------ */

type Tone = "legacy" | "adjudicate";

/**
 * One side of the compare. `legacy` is muted/red-tinted ambient authority;
 * `adjudicate` is execute-green tinted minted capability.
 */
function CompareCard({
  tone,
  eyebrow,
  icon,
  flow,
  bullets,
}: {
  tone: Tone;
  eyebrow: string;
  icon: React.ReactNode;
  flow: readonly string[];
  bullets: ReadonlyArray<readonly [string, string]>;
}) {
  const isAdj = tone === "adjudicate";
  const ring = isAdj ? "border-execute/40" : "border-refuse/30";
  const accentText = isAdj ? "text-execute" : "text-refuse";
  const dot = isAdj ? "bg-execute" : "bg-refuse";
  const bulletDot = isAdj ? "bg-execute" : "bg-refuse/70";

  return (
    <div
      className={`flex flex-col rounded-xl border ${ring} bg-console-panel p-6`}
    >
      {/* eyebrow */}
      <div className="flex items-center gap-2">
        <span className={accentText}>{icon}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-console-faint">
          {eyebrow}
        </span>
      </div>

      {/* mono flow well */}
      <div className="mt-4 rounded-lg border border-console-edge bg-console-canvas p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px]">
          {flow.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <span
                className={
                  i === flow.length - 1 && isAdj
                    ? "text-execute"
                    : i === flow.length - 1
                      ? "text-refuse"
                      : "text-console-ink"
                }
              >
                {step}
              </span>
              {i < flow.length - 1 ? (
                <ArrowRight size={12} className="text-console-faint" aria-hidden="true" />
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {/* bullets */}
      <ul className="mt-4 flex flex-col gap-2.5">
        {bullets.map(([term, gloss]) => (
          <li key={term} className="flex items-start gap-2.5">
            <span
              className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${bulletDot}`}
            />
            <span className="text-[13px] leading-relaxed">
              <span className={`font-mono ${accentText}`}>{term}</span>
              <span className="text-console-muted"> — {gloss}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* footer stamp */}
      <div className="mt-5 flex items-center gap-2 border-t border-console-edge pt-4">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-console-faint">
          {isAdj ? "expires after one action" : "valid until someone revokes it"}
        </span>
      </div>
    </div>
  );
}
