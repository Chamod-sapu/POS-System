import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { logSanitizedError } from '../../lib/errors';
import { Button } from './Button';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logSanitizedError(error, `ErrorBoundary: ${errorInfo.componentStack}`);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/60 p-6 sm:p-8 shadow-overlay text-center">
            <div className="mx-auto w-14 h-14 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mb-4 shadow-subtle">
              <AlertOctagon className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              An unexpected interface error occurred. Data and transactions in progress have been
              protected.
            </p>

            {this.state.error && (
              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-left text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={this.handleReset}
                leftIcon={<RotateCcw className="w-4 h-4" />}
                className="w-full sm:w-auto"
              >
                Try Again
              </Button>
              <Button
                variant="primary"
                onClick={this.handleReload}
                className="w-full sm:w-auto"
              >
                Reload Terminal
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
