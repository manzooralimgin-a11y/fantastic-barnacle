"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="glass-card max-w-md w-full p-8 text-center space-y-6">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-status-danger/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-status-danger" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-editorial font-semibold text-foreground">
                Something went wrong
              </h2>
              <p className="text-sm text-foreground-muted leading-relaxed">
                An unexpected error occurred in this section. Your data is safe
                — try refreshing to continue.
              </p>
            </div>

            {process.env.NODE_ENV !== "production" && this.state.error && (
              <div className="text-left bg-status-danger/5 border border-status-danger/15 rounded-xl p-4">
                <p className="text-xs font-mono text-status-danger break-all">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors text-sm font-semibold"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-foreground/5 text-foreground border border-foreground/10 hover:bg-foreground/10 transition-colors text-sm font-medium"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
