import { Link2 } from "lucide-react";

/**
 * AuditChain — ACT 3 · AUDIT.
 *
 * The proof surface: we don't narrate what happened, we re-derive it. Audit
 * records can be cryptographically chained — each links to the prior record in
 * its session by `prevAuditHash`. Re-deriving a record's auditHash byte-for-byte
 * catches any modification; the prevAuditHash chain catches delete or reorder.
 * The kernel emits the tamper-evident record; a production rail can thread the
 * link and sign checkpoints.
 *
 * Visual: a vertical chain of four mono cards, each carrying a short sha256
 * hash, joined by chain-link (⛓) connectors. The terminal AuditRecord node
 * wears an execute-green "✓ replayable" badge.
 *
 * Server component — static, no interactivity. The page wrapper supplies the
 * dark background and the per-section <Reveal>; this file only owns the band.
 */

interface ChainNode {
  /** Mono title of the link. */
  readonly title: string;
  /** One-line role of this record in the chain. */
  readonly role: string;
  /** Short sha256 prefix shown on the card (display only). */
  readonly hash: string;
  /** Whether this node carries the "✓ replayable" badge (terminal node). */
  readonly replayable?: boolean;
}

const NODES: ReadonlyArray<ChainNode> = [
  {
    title: "AuditRecord",
    role: "genesis record in the session stream · its own bytes re-derive",
    hash: "sha256:9f2a…c41e",
  },
  {
    title: "AuditRecord",
    role: "links to the record before it by prevAuditHash",
    hash: "sha256:4b7d…81a0",
  },
  {
    title: "AuditRecord",
    role: "links to the record before it by prevAuditHash",
    hash: "sha256:e0c8…5fa7",
  },
  {
    title: "AuditRecord",
    role: "head of the session chain · replay re-derives it byte-for-byte",
    hash: "sha256:1d63…ab92",
    replayable: true,
  },
];

export function AuditChain() {
  return (
    <section className="relative py-20 md:py-28">
      {/* one cool constitutional glow — single, low alpha, per restraint rule */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[460px] w-[760px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,0.12), rgba(99,102,241,0.03), transparent)",
          filter: "blur(30px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* header */}
        <header className="flex max-w-2xl flex-col gap-5">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-console-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-execute" />
            Replay, not narrate
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-console-ink md:text-4xl">
            Audit records can be cryptographically chained.
          </h2>
          <p className="text-base leading-relaxed text-console-muted md:text-lg">
            Each record links to the prior record in its session by{" "}
            <span className="font-mono text-console-ink">prevAuditHash</span>.
            Re-derive a record&apos;s auditHash byte-for-byte and any
            modification fails; deletion or reorder is caught by the chain. The
            kernel emits the tamper-evident record; a production rail can thread
            the link and sign checkpoints.
          </p>
        </header>

        {/* chain */}
        <div className="mt-12 grid items-start gap-px md:mt-16 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          {/* the vertical chain of four nodes */}
          <ol className="flex flex-col">
            {/* anchor: external signed checkpoint */}
            <li>
              <CheckpointAnchor />
              <Connector />
            </li>
            {NODES.map((node, i) => (
              <li key={node.title}>
                <ChainCard node={node} index={i + 1} />
                {i < NODES.length - 1 ? <Connector /> : null}
              </li>
            ))}
          </ol>

          {/* explanatory rail */}
          <aside className="md:pl-8 md:pt-2">
            <div className="rounded-xl border border-console-edge bg-console-panel p-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-console-faint">
                how the chain holds
              </span>
              <ul className="mt-4 flex flex-col gap-4">
                <RailItem term="prevAuditHash">
                  Each record carries the sha256 of the record before it, so
                  deleting or reordering any record breaks the chain — the
                  tamper a record&apos;s own bytes can&apos;t reveal.
                </RailItem>
                <RailItem term="signed checkpoint">
                  An <span className="text-console-ink">external</span> signer
                  periodically anchors the chain&apos;s head, so the sequence
                  can&apos;t be silently rewound, rebuilt, or truncated at the
                  tail.
                </RailItem>
                <RailItem term="byte-identical replay">
                  Re-derive a record&apos;s auditHash from its own bytes and it
                  must reproduce <span className="text-console-ink">
                  byte-for-byte</span> — any modification of a present record
                  fails, no key required. That re-derivation, not a narrative,
                  is the proof.
                </RailItem>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

/** The external signed checkpoint that anchors the head of the chain. */
function CheckpointAnchor() {
  return (
    <div className="rounded-xl border border-brand/40 bg-brand/[0.06] p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand">
          external signed checkpoint
        </span>
        <span className="font-mono text-[10px] text-console-faint">anchor</span>
      </div>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-console-muted">
        signs the chain head out-of-band
      </p>
    </div>
  );
}

/** A single chain link rendered as a mono card. */
function ChainCard({ node, index }: { node: ChainNode; index: number }) {
  return (
    <div
      className={`rounded-xl border bg-console-panel p-5 transition-colors ${
        node.replayable
          ? "border-execute/40 bg-execute/[0.06]"
          : "border-console-edge"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-console-faint">
            {index.toString().padStart(2, "0")}
          </span>
          <span className="font-mono text-[13px] font-semibold tracking-tight text-console-ink">
            {node.title}
          </span>
        </div>
        {node.replayable ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-execute/40 bg-execute/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-execute">
            ✓ replayable
          </span>
        ) : null}
      </div>

      <p className="mt-2 font-mono text-[11px] leading-relaxed text-console-muted">
        {node.role}
      </p>

      {/* hash well — inset on canvas inside the panel */}
      <div className="mt-3 rounded-lg border border-console-edge bg-console-canvas px-3 py-2">
        <span className="font-mono text-[11px] text-console-faint">
          {index === 1 ? "auditHash" : "prevAuditHash"}{" "}
        </span>
        <span className="font-mono text-[11px] text-console-ink">
          {node.hash}
        </span>
      </div>
    </div>
  );
}

/** Chain-link connector between two nodes. */
function Connector() {
  return (
    <div
      aria-hidden
      className="flex flex-col items-center py-2 text-console-faint"
    >
      <span className="h-3 w-px bg-console-edge" />
      <span className="my-0.5 inline-flex items-center gap-1.5 font-mono text-[11px]">
        <Link2 size={14} aria-hidden="true" className="text-console-faint" />
        <span aria-hidden>⛓</span>
      </span>
      <span className="h-3 w-px bg-console-edge" />
    </div>
  );
}

function RailItem({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1">
      <code className="w-fit rounded-md border border-console-edge bg-console-canvas px-2 py-0.5 font-mono text-[11px] text-console-ink">
        {term}
      </code>
      <p className="text-sm leading-relaxed text-console-muted">{children}</p>
    </li>
  );
}
