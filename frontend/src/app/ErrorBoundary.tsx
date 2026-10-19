import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Top-level error boundary — the SPA replacement for Next's `error.tsx` /
 * `global-error.tsx` route conventions. React has no hook-based equivalent, so
 * this stays a class component (the only one in the codebase).
 *
 * `reset` clears the captured error and re-renders the subtree, matching the
 * `reset` callback the Next boundaries used to receive.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="container mx-auto flex max-w-2xl flex-col items-start gap-4 p-8">
        <h1 className="text-3xl font-bold">Something went wrong</h1>
        <p className="text-fg-muted">An unexpected error occurred. You can try again.</p>
        <button
          type="button"
          data-testid="error-retry"
          onClick={this.reset}
          className="h-8 cursor-pointer rounded-md border-0 bg-indigo px-3 font-semibold text-white hover:bg-indigo-80"
        >
          Try again
        </button>
      </main>
    );
  }
}
