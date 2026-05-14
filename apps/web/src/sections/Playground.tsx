"use client";

import { useState } from "react";
import { DecisionLab } from "./playground/DecisionLab";
import { PixFlow } from "./playground/PixFlow";
import { KycFlow } from "./playground/KycFlow";
import { DeploymentsFlow } from "./playground/DeploymentsFlow";
import { AuditLog } from "./playground/AuditLog";
import {
  AuditLogProvider,
  useAuditLog,
} from "./playground/audit-log-context";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "lab", label: "Decision Lab" },
  { id: "pix", label: "PIX Flow" },
  { id: "kyc", label: "KYC Flow" },
  { id: "deployments", label: "Deployments Flow" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Playground() {
  return (
    <AuditLogProvider>
      <PlaygroundInner />
    </AuditLogProvider>
  );
}

function PlaygroundInner() {
  const [tab, setTab] = useState<TabId>("lab");
  const { entries, clear } = useAuditLog();
  return (
    <section id="playground" className="bg-surface py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Live playground"
          title="Adjudicate something."
          subtitle="The real kernel runs against the real Packs server-side. Pick an intent, hit Adjudicate, and watch the kernel decide."
          align="center"
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-[3fr_1fr]">
          <div className="rounded-2xl border border-edge bg-canvas shadow-sm">
            <div className="flex flex-wrap gap-1 border-b border-edge px-4 pt-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "rounded-t-md px-4 py-2 text-sm font-medium transition-colors",
                    tab === t.id
                      ? "bg-surface text-ink shadow-[inset_0_-2px_0_0_rgb(99_102_241)]"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="p-5 md:p-6">
              {tab === "lab" ? <DecisionLab /> : null}
              {tab === "pix" ? <PixFlow /> : null}
              {tab === "kyc" ? <KycFlow /> : null}
              {tab === "deployments" ? <DeploymentsFlow /> : null}
            </div>
          </div>
          <AuditLog entries={entries} onClear={clear} />
        </div>
      </div>
    </section>
  );
}
