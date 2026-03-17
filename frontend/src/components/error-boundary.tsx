"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
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
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: '#fee', color: '#900', height: '100vh', width: '100vw', zIndex: 9999, position: 'fixed', top: 0, left: 0, overflow: 'auto' }}>
          <h1>Something went wrong.</h1>
          {process.env.NODE_ENV === "development" && (
            <>
              <h3 style={{fontFamily: 'monospace'}}>{this.state.error && this.state.error.toString()}</h3>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
              <hr />
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                {this.state.error && this.state.error.stack}
              </pre>
            </>
          )}
          {process.env.NODE_ENV !== "development" && (
            <p>An unexpected error occurred. Please try refreshing the page.</p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
