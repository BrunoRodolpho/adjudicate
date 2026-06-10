import type { ReactNode } from "react";

export interface PostMeta {
  readonly slug: string;
  readonly title: string;
  readonly date: string; // YYYY-MM-DD
  readonly author: string;
  readonly summary: string;
  readonly tags: ReadonlyArray<string>;
}

export interface Post extends PostMeta {
  readonly body: () => ReactNode;
}

import { CapTokenSpend } from "./blog-posts/cap-token-spend";
import { HumanApprovalResume } from "./blog-posts/human-approval-resume";
import { LaunchingAdjudicate } from "./blog-posts/launching-adjudicate";
import { StopAgentDrainingProd } from "./blog-posts/stop-agent-draining-prod";

export const POSTS: ReadonlyArray<Post> = [
  {
    slug: "stop-agent-draining-prod",
    title: "How to stop your AI agent from draining production",
    date: "2026-06-04",
    author: "the adjudicate team",
    summary:
      "Put a deterministic policy kernel between your AI agent and prod: clamp deploy ramps (REWRITE), cap LLM token spend (REFUSE), and score shell-command risk — every decision audited with a tamper-evident hash.",
    tags: ["Guardrails", "Production", "REWRITE"],
    body: StopAgentDrainingProd,
  },
  {
    slug: "human-approval-resume",
    title: "How to pause an AI agent for human approval — and resume it safely",
    date: "2026-06-02",
    author: "the adjudicate team",
    summary:
      "DEFER is a first-class outcome: the kernel parks an intent on a signal until a human or webhook responds, then resumes the exact same intent. A bounded, replay-safe human-in-the-loop pattern for KYC and PIX flows.",
    tags: ["DEFER", "Human-in-the-loop", "KYC"],
    body: HumanApprovalResume,
  },
  {
    slug: "cap-token-spend",
    title: "How to cap LLM token spend per session",
    date: "2026-05-30",
    author: "the adjudicate team",
    summary:
      "Give an agent loop a hard per-session token ceiling. createTokenBudgetGuard reads a counter from audited state and REFUSEs (or DEFERs) the next step once it crosses the cap — a deterministic, replay-verifiable cost limit, not an unbounded bill.",
    tags: ["Token budget", "REFUSE", "Cost control"],
    body: CapTokenSpend,
  },
  {
    slug: "launching-adjudicate",
    title: "Launching adjudicate: the policy kernel for LLM-mediated actions",
    date: "2026-05-13",
    author: "the adjudicate team",
    summary:
      "Adjudicate is a deterministic policy-and-audit kernel for AI agent workflows. The v1 core ships six Decision outcomes, a replay-safe audit ledger, signed receipts, and an operator console.",
    tags: ["Announcement", "Architecture"],
    body: LaunchingAdjudicate,
  },
];

export function findPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/** All distinct tags across posts, in first-seen order (for filters/footers). */
export const BLOG_TAGS: ReadonlyArray<string> = [
  ...new Set(POSTS.flatMap((p) => p.tags)),
];
