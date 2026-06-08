import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionTone = "canvas" | "surface" | "console";

const TONE_STYLES: Record<SectionTone, string> = {
  canvas: "bg-canvas",
  surface: "bg-surface",
  console: "bg-zinc-950 text-zinc-100",
};

/**
 * Vertical-rhythm section wrapper. Sets the background per tone and centres
 * an inner content column. Server component — no interactivity.
 */
export function Section({
  tone = "canvas",
  id,
  className,
  children,
}: {
  readonly tone?: SectionTone;
  readonly id?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("py-24 md:py-32", TONE_STYLES[tone], className)}
    >
      <div className="mx-auto max-w-6xl px-6">{children}</div>
    </section>
  );
}
