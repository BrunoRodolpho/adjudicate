"use client";

import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { PRIMITIVES, REPO_BASE } from "@/content/primitives";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function PrimitivesDiagram() {
  return (
    <section className="bg-surface py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Seven primitives"
          title="Underneath the kernel: a small, named surface."
          subtitle="Every claim on this page resolves to one of these seven source files. The framework is small on purpose — the value is in their precise composition, not their count."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {PRIMITIVES.map((p, idx) => (
            <motion.a
              key={p.name}
              href={`${REPO_BASE}${p.sourcePath}`}
              target="_blank"
              rel="noreferrer"
              initial={{ y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: idx * 0.04 }}
              className="group flex min-w-0 flex-col gap-2 rounded-xl bg-canvas p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:bg-brand/5 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <code className="text-base font-semibold text-ink">{p.name}</code>
                <ExternalLink
                  size={14}
                  className="text-faint group-hover:text-brand-ink"
                />
              </div>
              <span className="text-xs uppercase tracking-section text-muted">
                {p.tagline}
              </span>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {p.description}
              </p>
              <code className="mt-2 break-all text-[11px] text-muted">
                {p.sourcePath}
              </code>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
