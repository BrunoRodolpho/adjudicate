import {
  CircleCheck,
  Clock,
  HelpCircle,
  RotateCcw,
  ShieldX,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { DecisionKind } from "@adjudicate/core";
import { DECISIONS, type DecisionContent } from "@/content/decisions";
import { cn } from "@/lib/cn";

/**
 * Maps the icon NAME stored in DECISIONS to its lucide component. Mirrors
 * the mapping used by the motion DecisionBadge so the two stay in lockstep.
 */
const ICONS: Record<DecisionContent["icon"], LucideIcon> = {
  CircleCheck,
  ShieldX,
  RotateCcw,
  Clock,
  UserCheck,
  HelpCircle,
};

type ChipSize = "sm" | "md" | "lg";

const SIZE_STYLES: Record<ChipSize, { wrapper: string; icon: number }> = {
  sm: { wrapper: "gap-1.5 px-2.5 py-1 text-[11px]", icon: 12 },
  md: { wrapper: "gap-2 px-3 py-1.5 text-xs", icon: 14 },
  lg: { wrapper: "gap-2.5 px-4 py-2 text-[13px]", icon: 16 },
};

/**
 * The single canonical six-outcome chip: decision-coloured pill with the
 * outcome icon + uppercase label. The one and only way an outcome is shown as
 * a chip (the old animated motion/DecisionBadge was folded in here). Renderable
 * in both server and client trees.
 */
export function DecisionChip({
  kind,
  size = "md",
  className,
}: {
  readonly kind: DecisionKind;
  readonly size?: ChipSize;
  readonly className?: string;
}) {
  const c = DECISIONS[kind];
  const Icon = ICONS[c.icon];
  const s = SIZE_STYLES[size];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium uppercase tracking-section",
        c.accent,
        c.bg,
        c.border,
        s.wrapper,
        className,
      )}
    >
      <Icon size={s.icon} aria-hidden="true" />
      <span>{c.headline}</span>
    </span>
  );
}
