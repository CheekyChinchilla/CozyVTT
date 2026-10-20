/**
 * Error boundary for character sheet components
 */

import React, { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * While the error is showing, a new value tries the sheet again, such as a
   * new version of the character. A sheet that is drawn is left alone, so it
   * keeps its open tab.
   */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CharacterSheetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Logged whole: a render error carries no request, and its stack says where.
    console.error('Character sheet error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="glass-panel p-6">
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="p-4 rounded-full bg-danger/15">
              <AlertCircle className="w-8 h-8 text-danger-ink" />
            </div>
            <h3 className="text-lg font-semibold text-warm-gray">
              Error Loading Character Sheet
            </h3>
            <p className="text-sm text-stone-gray text-center max-w-md">
              {this.state.error?.message || 'An unexpected error occurred while loading the character sheet.'}
            </p>
            <Button onClick={() => this.setState({ hasError: false, error: null })}>
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
