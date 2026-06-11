"use client";

import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Skeleton";

export interface AsyncBoundaryProps {
  isLoading: boolean;
  isError: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  /** Overrides the default <Skeleton/> shown while loading. */
  loadingFallback?: ReactNode;
  /** Overrides the default <EmptyState/> shown when empty. */
  emptyFallback?: ReactNode;
  errorMessage?: string;
  children: ReactNode;
}

/**
 * The primary state primitive for governance surfaces. Resolves, in order:
 * loading -> error -> empty -> children, so a section never shows two states at
 * once. Loading is checked first because in-flight data is neither errored nor
 * meaningfully empty; error precedes empty so a failed fetch never masquerades
 * as "no data".
 *
 * Ported from apps/console (ADR-128: copy, don't share). No color tokens of its
 * own — it composes the renamed EmptyState/ErrorState/Skeleton primitives.
 */
export function AsyncBoundary({
  isLoading,
  isError,
  isEmpty = false,
  onRetry,
  loadingFallback,
  emptyFallback,
  errorMessage,
  children,
}: AsyncBoundaryProps) {
  if (isLoading) {
    return <>{loadingFallback ?? <Skeleton />}</>;
  }
  if (isError) {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }
  if (isEmpty) {
    return <>{emptyFallback ?? <EmptyState title="No data" />}</>;
  }
  return <>{children}</>;
}
