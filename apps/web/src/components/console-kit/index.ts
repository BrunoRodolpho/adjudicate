/**
 * console-kit — the operator console's zero-dependency design kit, COPIED into
 * apps/web (ADR-128: there is no shared @adjudicate/ui package; we copy, not
 * import from apps/console).
 *
 * On copy, color-token utility classes were renamed to the console.* dark
 * namespace (bg-panel → bg-console-panel, text-ink → text-console-ink, etc.)
 * so these components render correctly on apps/web's dark surfaces. Hardcoded
 * RGB chart fills and default-tailwind decision classes (text-emerald-300, …)
 * were left unchanged — they already read correctly on dark.
 *
 * Every console replica MUST render inside {@link ConsoleChrome}, which carries
 * the standing "Illustrative replica of the operator console · sample data"
 * label — the reviewed honesty boundary (no fake live data).
 */
export * from "./chrome";
export * from "./charts";
export * from "./a11y";
export * from "./ui";
export {
  decisionTheme,
  DECISION_KIND_ORDER,
  type DecisionThemeToken,
} from "./decision-theme";
