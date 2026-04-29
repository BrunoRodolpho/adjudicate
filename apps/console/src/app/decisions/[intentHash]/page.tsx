"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { DecisionTrace } from "@/components/decision/DecisionTrace";
import { useDecisionByHash } from "@/hooks/useDecisionByHash";

interface PageProps {
  params: Promise<{ intentHash: string }>;
}

/**
 * Decision detail route.
 *
 * Next 15 + React 19: dynamic-segment `params` is a Promise. We're a client
 * component (TanStack Query needs the browser), so we unwrap with React 19's
 * `use()` rather than `await`.
 */
export default function DecisionDetailPage({ params }: PageProps) {
  const { intentHash } = use(params);
  const router = useRouter();
  const { data, isLoading, isError } = useDecisionByHash(intentHash);

  return (
    <div className="flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex w-fit items-center gap-1 text-[11px] text-muted hover:text-ink"
      >
        <ChevronLeft size={12} /> back to audit
      </button>

      {isLoading ? (
        <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] text-muted">
          Loading decision…
        </div>
      ) : isError ? (
        <div className="rounded-sm border border-red-500/40 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">
          Failed to load decision. Try refreshing.
        </div>
      ) : !data ? (
        <div className="rounded-sm border border-edge bg-panel/40 px-3 py-2 text-[11px] italic text-faint">
          No audit record found for intentHash{" "}
          <code className="text-muted">{intentHash}</code>.
        </div>
      ) : (
        <DecisionTrace record={data} />
      )}
    </div>
  );
}
