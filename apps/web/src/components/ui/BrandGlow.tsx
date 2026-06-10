import { cn } from "@/lib/cn";

/**
 * A restrained, coded brand-presence backdrop (no raster imagery): a faint
 * dot-grid texture + a soft indigo→violet radial glow. Tasteful Linear/Vercel
 * register — breaks a flat white field with colour and depth without the
 * generic full-bleed AI gradient. Purely decorative (aria-hidden,
 * pointer-events-none); place inside a `relative overflow-hidden` parent and
 * render the real content above it with `relative z-10`.
 */
export function BrandGlow({
  className,
  corner = "right",
}: {
  readonly className?: string;
  /** Which top corner the glow anchors to. */
  readonly corner?: "right" | "left";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/* Faint dot grid — quiet engineering texture. */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(rgb(228 228 231) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(120% 100% at 50% 0%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(120% 100% at 50% 0%, black 30%, transparent 75%)",
        }}
      />
      {/* Soft brand glow in a top corner. */}
      <div
        className={cn(
          "absolute -top-24 h-[360px] w-[360px] rounded-full",
          corner === "right" ? "-right-20" : "-left-20",
        )}
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,0.13), rgba(139,92,246,0.05), transparent)",
          filter: "blur(24px)",
        }}
      />
    </div>
  );
}
