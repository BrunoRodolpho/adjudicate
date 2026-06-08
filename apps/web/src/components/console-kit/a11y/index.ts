/**
 * Accessibility primitives for the operator-console design kit.
 *
 * Ported from apps/console (ADR-128: copy, don't share). The console's index
 * also re-exported a `useAriaLive` hook; that hook is not part of this barrier
 * port (apps/web has no `@/hooks/useAriaLive`) and is intentionally omitted.
 */
export { VisuallyHidden } from "./VisuallyHidden";
export { SkipLink } from "./SkipLink";
export { DataTable } from "./DataTable";
export type {
  DataTableColumn,
  DataTableProps,
} from "./DataTable";
