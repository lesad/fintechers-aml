/** What a list loaded a page at a time knows about itself. */
type PagedState = { loading: boolean; error: string | null; items: unknown[]; total: number };

/**
 * The controls of a paged list: whether everything is loaded, a `loadMore` that asks for page [next] only when it
 * makes sense, and a `retry` that repeats the failed request (from the start when nothing loaded yet).
 */
export function pageControls(
  state: PagedState,
  next: number,
  load: (page: number, reset: boolean) => void,
) {
  const done = !state.loading && state.items.length >= state.total;
  return {
    done,
    loadMore: () => {
      if (!state.loading && !done && !state.error) load(next, false);
    },
    retry: () => load(next, state.items.length === 0),
  };
}
