// ============================================
// ErrorBoundary — App-level React error boundary
// Catches unhandled render errors and shows a friendly recovery UI instead of a blank screen.
// ============================================

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI (overrides default) */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log for developers / future error reporting service
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 p-4">
        <div className="glass-panel max-w-lg w-full p-8 text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-red-100">
              <AlertTriangle className="w-10 h-10 text-red-600" aria-hidden="true" />
            </div>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-2xl font-bold text-moss-green font-heading mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-warm-gray">
              CozyVTT encountered an unexpected error. Your data is safe — this is a display problem only.
            </p>
          </div>

          {/* Error details (collapsible) */}
          {this.state.error && (
            <details className="text-left bg-red-50 border border-red-200 rounded-lg p-4">
              <summary className="text-sm font-medium text-red-800 cursor-pointer select-none">
                Error details
              </summary>
              <pre className="mt-2 text-xs text-red-700 overflow-x-auto whitespace-pre-wrap break-words">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack
                  ? '\n\nComponent stack:' + this.state.errorInfo.componentStack
                  : ''}
              </pre>
            </details>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={this.handleReset}
              variant="secondary" className="flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" aria-hidden="true" />
              Try Again
            </Button>

            <Button
              onClick={this.handleReload}
              className="flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" aria-hidden="true" />
              Reload Page
            </Button>

            <a
              href="https://github.com/CheekyChinchilla/CozyVTT/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center justify-center gap-2"
              aria-label="Report this issue on GitHub (opens in new tab)"
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Report Issue
            </a>
          </div>
        </div>
      </div>
    );
  }
}
