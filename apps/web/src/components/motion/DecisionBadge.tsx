"use client";

import { motion } from "framer-motion";
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

const ICONS: Record<DecisionContent["icon"], LucideIcon> = {
  CircleCheck,
  ShieldX,
  RotateCcw,
  Clock,
  UserCheck,
  HelpCircle,
};

/**
 * Animated Decision badge — the central object the hero kernel emits and
 * the wedge-comparison table references.
 */
export function DecisionBadge({
  kind,
  size = "md",
  animate = true,
}: {
  kind: DecisionKind;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}) {
  const c = DECISIONS[kind];
  const Icon = ICONS[c.icon];
  const sizeClasses =
    size === "lg"
      ? "px-5 py-3 text-base gap-3"
      : size === "sm"
        ? "px-2.5 py-1 text-xs gap-1.5"
        : "px-4 py-2 text-sm gap-2";
  const Wrapper = animate ? motion.div : "div";
  return (
    <Wrapper
      initial={animate ? { opacity: 0, y: 8, scale: 0.95 } : undefined}
      animate={animate ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`inline-flex items-center rounded-full border ${c.border} ${c.bg} ${c.accent} ${sizeClasses} font-medium`}
    >
      <Icon size={size === "lg" ? 18 : size === "sm" ? 12 : 14} />
      <span>{c.headline}</span>
    </Wrapper>
  );
}
