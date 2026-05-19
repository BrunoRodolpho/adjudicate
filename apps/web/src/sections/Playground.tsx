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
import { PolicyProvider } from "./playground/policy-context";
import { PackInspector } from "./playground/PackInspector";
import { DecisionLegend } from "./playground/DecisionLegend";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "lab", label: "Decision Lab · free-form" },
  { id: "pix", label: "PIX Flow · scripted" },
  { id: "kyc", label: "KYC Flow · scripted" },
  { id: "deployments", label: "Deployments Flow · scripted" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Playground() {
  return (
    <PolicyProvider>
      <AuditLogProvider>
        <PlaygroundInner />
      </AuditLogProvider>
    </PolicyProvider>
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
          subtitle="One tab is a free-form lab — type your own JSON. Three are scripted demos — click Run on each step. The audit log on the right accumulates everything you do."
          align="center"
        />

        <div className="mt-10 grid gap-4 lg:grid-cols-[3fr_1fr]">
          <div className="flex flex-col gap-3">
            <PackInspector activeTab={tab} />
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
          </div>
          <div className="flex flex-col gap-3">
            <DecisionLegend />
            <AuditLog entries={entries} onClear={clear} />
          </div>
        </div>
      </div>
    </section>
  );
}
