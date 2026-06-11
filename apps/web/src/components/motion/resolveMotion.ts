"use client";

import { motion } from "framer-motion";
import type { ElementType } from "react";

/**
 * Resolve an `ElementType` to a framer-motion component without re-creating it
 * on every render.
 *
 * `motion(Component)` builds a brand-new component each call — doing that
 * inside a render body breaks memoisation and forces remounts. For the handful
 * of intrinsic tags our wrappers actually use we hand back the *stable*,
 * pre-created `motion.div` / `motion.li` / … references; for anything else
 * (custom components, exotic tags) we fall back to the factory and cache the
 * result so repeat renders reuse the same component identity.
 */

// Pre-created, stable motion components for the tags these wrappers use.
const INTRINSIC: Partial<Record<string, ElementType>> = {
  div: motion.div,
  span: motion.span,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  section: motion.section,
  article: motion.article,
  nav: motion.nav,
  a: motion.a,
  p: motion.p,
};

// Cache for non-intrinsic element types so we don't rebuild factories.
const cache = new WeakMap<object, ElementType>();

export function resolveMotion(as: ElementType): ElementType {
  if (typeof as === "string") {
    return INTRINSIC[as] ?? (motion(as) as unknown as ElementType);
  }
  const cached = cache.get(as as object);
  if (cached) return cached;
  const made = motion(
    as as Parameters<typeof motion>[0],
  ) as unknown as ElementType;
  cache.set(as as object, made);
  return made;
}
