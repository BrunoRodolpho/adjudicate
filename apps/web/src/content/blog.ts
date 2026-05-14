import type { ReactNode } from "react";

export interface PostMeta {
  readonly slug: string;
  readonly title: string;
  readonly date: string; // YYYY-MM-DD
  readonly author: string;
  readonly summary: string;
}

export interface Post extends PostMeta {
  readonly body: () => ReactNode;
}

import { LaunchingAdjudicate } from "./blog-posts/launching-adjudicate";

export const POSTS: ReadonlyArray<Post> = [
  {
    slug: "launching-adjudicate",
    title: "Launching adjudicate: the policy kernel for LLM-mediated actions",
    date: "2026-05-13",
    author: "the adjudicate team",
    summary:
      "Adjudicate is a deterministic policy-and-audit kernel for AI agent workflows. v0.1 ships three Packs, six Decision outcomes, replay-safe ledger, and an operator console.",
    body: LaunchingAdjudicate,
  },
];

export function findPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
