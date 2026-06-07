"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";

export interface ErrorBoundaryProps {
  /** Rendered in place of the default <ErrorState/> when a child throws. */
  fallback?: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render-time errors from any descendant and shows a fallback instead of
 * unmounting the whole tree. Error boundaries must be class components — there is
 * no hook equivalent for getDerivedStateFromError / componentDidCatch.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for diagnostics without taking the tree down. No network/telemetry
    // dependency here — the console wires those separately.
    console.error("ErrorBoundary caught an error", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorState />;
    }
    return this.props.children;
  }
}
