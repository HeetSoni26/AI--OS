"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";

type BoundaryProps = { children: ReactNode; title?: string; compact?: boolean };
type BoundaryState = { hasError: boolean };

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI boundary caught an error", { error, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Empty
        className={this.props.compact ? "min-h-32" : undefined}
        icon={<AlertTriangle aria-hidden="true" className="size-4 text-orange-300" />}
        title={this.props.title ?? "This area is unavailable"}
        description="The rest of the workspace is still available. Try this area again or come back later."
        action={<Button size="sm" variant="secondary" onClick={() => this.setState({ hasError: false })}><RotateCcw aria-hidden="true" className="size-3.5" />Try again</Button>}
      />
    );
  }
}

export function WidgetBoundary({ children, title }: BoundaryProps) {
  return <ErrorBoundary compact title={title}>{children}</ErrorBoundary>;
}
