import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("PraanSewa Uncaught Error Caught by Boundary:", error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('upchaar_session');
      localStorage.removeItem('upchaar_last_emergency');
    } catch (e) {}
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 p-8 rounded-3xl shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/30 text-2xl font-bold">
              ⚠️
            </div>
            <h2 className="text-xl font-bold mb-2">Display Recovery Triggered</h2>
            <p className="text-slate-400 text-xs mb-6 leading-relaxed">
              {this.state.error?.message || "An unexpected rendering event occurred. We have safely isolated the state."}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-emerald-900/30 cursor-pointer"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Clear Stale Session & Re-Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
