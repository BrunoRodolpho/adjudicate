import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AsyncBoundary } from "./AsyncBoundary";

beforeEach(() => {
  cleanup();
});

const child = <div data-testid="content">section content</div>;

describe("AsyncBoundary", () => {
  it("renders the loading skeleton when isLoading is true", () => {
    render(
      <AsyncBoundary isLoading isError={false}>
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("skeleton")).toBeDefined();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("renders a custom loadingFallback when provided", () => {
    render(
      <AsyncBoundary isLoading isError={false} loadingFallback={<div data-testid="custom-loading" />}>
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("custom-loading")).toBeDefined();
    expect(screen.queryByTestId("skeleton")).toBeNull();
  });

  it("renders the error state when isError is true", () => {
    render(
      <AsyncBoundary isLoading={false} isError>
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("forwards errorMessage to the error state", () => {
    render(
      <AsyncBoundary isLoading={false} isError errorMessage="Probe fetch failed">
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByText("Probe fetch failed")).toBeDefined();
  });

  it("wires onRetry through to the error state button", () => {
    const onRetry = vi.fn();
    render(
      <AsyncBoundary isLoading={false} isError onRetry={onRetry}>
        {child}
      </AsyncBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("prioritizes loading over error when both are true", () => {
    render(
      <AsyncBoundary isLoading isError>
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("skeleton")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("prioritizes error over empty when both apply", () => {
    render(
      <AsyncBoundary isLoading={false} isError isEmpty>
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });

  it("renders the default empty state when isEmpty is true", () => {
    render(
      <AsyncBoundary isLoading={false} isError={false} isEmpty>
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("empty-state")).toBeDefined();
    expect(screen.getByText("No data")).toBeDefined();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("renders a custom emptyFallback when provided", () => {
    render(
      <AsyncBoundary
        isLoading={false}
        isError={false}
        isEmpty
        emptyFallback={<div data-testid="custom-empty" />}
      >
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("custom-empty")).toBeDefined();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });

  it("renders children when not loading, not error, and not empty", () => {
    render(
      <AsyncBoundary isLoading={false} isError={false}>
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("content")).toBeDefined();
  });

  it("treats isEmpty as false by default", () => {
    render(
      <AsyncBoundary isLoading={false} isError={false}>
        {child}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("content")).toBeDefined();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });
});
