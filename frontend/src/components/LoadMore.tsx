import { useEffect, useRef } from "react";

type LoadMoreProps = {
  /** Called when the sentinel scrolls into view and more can be loaded. */
  onLoadMore: () => void;
  loading: boolean;
  done: boolean;
  error?: string | null;
  onRetry?: () => void;
};

/**
 * Sits under a scrolling list: asks for the next page as it comes into view, and shows a
 * spinner while a page loads, an error with a retry, or nothing once everything is loaded.
 */
export function LoadMore({ onLoadMore, loading, done, error, onRetry }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || loading || error) return;
    // A generous margin starts the next page before the user reaches the bottom.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, loading, done, error]);

  if (done) return null;
  return (
    <div
      ref={sentinel}
      className="flex h-12 items-center justify-center gap-2 text-xs text-fg-subtle"
    >
      {error ? (
        <>
          <span className="text-high">Could not load more: {error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="cursor-pointer border-0 bg-transparent p-0 text-xs text-fg-muted underline hover:text-purple"
            >
              Retry
            </button>
          )}
        </>
      ) : (
        loading && (
          <>
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-border border-t-purple"
            />
            <span role="status">Loading…</span>
          </>
        )
      )}
    </div>
  );
}
