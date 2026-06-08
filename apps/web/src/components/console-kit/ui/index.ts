/**
 * State primitives for the operator-console design kit (loading / empty / error
 * and the AsyncBoundary that resolves between them).
 *
 * Ported from apps/console (ADR-128: copy, don't share). The console's index
 * also exported ErrorBoundary; that class component is outside this barrier
 * port's scope and is intentionally omitted.
 */
export { Skeleton, type SkeletonProps } from "./Skeleton";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export { AsyncBoundary, type AsyncBoundaryProps } from "./AsyncBoundary";
