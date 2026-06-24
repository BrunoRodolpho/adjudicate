import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={`flex flex-col gap-3 ${align === "center" ? "items-center text-center" : ""}`}
    >
      {eyebrow ? (
        <span className="text-eyebrow uppercase text-console-muted">{eyebrow}</span>
      ) : null}
      <h2 className="text-h2 text-console-ink md:text-h2-lg">{title}</h2>
      {subtitle ? (
        <p className="max-w-measure text-lead text-console-muted md:text-lead-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
