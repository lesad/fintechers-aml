import { cva } from "class-variance-authority";

import {
  type CaseStatus,
  type Column,
  LoadMore,
  RatingBadge,
  Select,
  StatusLabel,
  Table,
} from "@/components";

import {
  DISPOSITION_LABEL,
  formatAge,
  formatAmount,
  NO_FILTER,
  type QueueFilter,
  type QueueItem,
} from "./queue";

type ReviewQueueProps = {
  /** Loaded so far, decisions applied. */
  items: QueueItem[];
  /** Rows matching the search and rating on the server. */
  total: number;
  loading: boolean;
  done: boolean;
  error: string | null;
  onLoadMore: () => void;
  onRetry: () => void;
  filter: QueueFilter;
  onFilter: (f: QueueFilter) => void;
  /** The statuses the status filter offers. */
  statuses: CaseStatus[];
  /** Ids open in a tab: their rows are highlighted. */
  openIds: string[];
  onOpen: (id: string, background: boolean) => void;
};

const txId = cva("font-mono text-xs", { variants: { open: { true: "font-bold" } } });

/** Age since flagged: muted once closed, bold when an open case is older than 72 h. */
const age = cva("", {
  variants: {
    state: { closed: "text-fg-subtle", overdue: "font-semibold text-fg", open: "text-fg-muted" },
  },
});

export function ReviewQueue({
  items,
  total,
  loading,
  done,
  error,
  onLoadMore,
  onRetry,
  filter,
  onFilter,
  statuses,
  openIds,
  onOpen,
}: ReviewQueueProps) {
  const now = new Date();
  const hasFilters = filter.query !== "" || filter.rating !== "all" || filter.status !== "all";

  const columns: Column<QueueItem>[] = [
    {
      key: "rating",
      header: "Rating · score",
      width: 130,
      cell: (r) => (
        <span
          className="flex items-center gap-2"
          title={`Triage: ${DISPOSITION_LABEL[r.disposition]} · score ${r.score} of 100`}
        >
          <RatingBadge rule={r.rule} ai={r.ai} />
          <span className="text-xs text-fg-muted tabular-nums">{r.score}</span>
        </span>
      ),
    },
    {
      key: "reason",
      header: "Rule",
      className: "text-ellipsis text-fg-muted",
      cell: (r) => <span title={r.ruleReason}>{r.ruleReason}</span>,
    },
    {
      key: "id",
      header: "Transaction",
      width: 130,
      cell: (r) => <span className={txId({ open: openIds.includes(r.id) })}>{r.id}</span>,
    },
    {
      key: "client",
      header: "Client",
      width: 96,
      className: "font-mono text-xs text-fg-muted",
      cell: (r) => r.client,
    },
    {
      key: "amount",
      header: "Amount (CZK)",
      width: 140,
      align: "right",
      className: "tabular-nums",
      cell: (r) => formatAmount(r.amount),
    },
    {
      key: "date",
      header: "Date and time",
      width: 132,
      className: "tabular-nums text-fg-muted",
      cell: (r) => r.date,
    },
    { key: "status", header: "Status", width: 100, cell: (r) => <StatusLabel status={r.status} /> },
    {
      key: "flagged",
      header: "Flagged",
      width: 84,
      align: "right",
      className: "tabular-nums",
      cell: (r) => {
        const closed = r.status === "False Positive" || r.status === "Reported";
        const overdue = now.getTime() - r.flagged.getTime() > 72 * 3_600_000;
        const state = closed ? "closed" : overdue ? "overdue" : "open";
        return <span className={age({ state })}>{formatAge(r.flagged, now)}</span>;
      },
    },
  ];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border-soft px-4 py-2.5">
        <input
          aria-label="Search transaction or client ID"
          placeholder="Search transaction or client ID"
          value={filter.query}
          onChange={(e) => onFilter({ ...filter, query: e.target.value })}
          className="h-7 w-[260px] rounded border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25"
        />
        <Select
          aria-label="Rule rating"
          value={filter.rating}
          onChange={(e) => onFilter({ ...filter, rating: e.target.value as QueueFilter["rating"] })}
        >
          <option value="all">All rule ratings</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </Select>
        <Select
          aria-label="Status"
          value={filter.status}
          onChange={(e) => onFilter({ ...filter, status: e.target.value as QueueFilter["status"] })}
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => onFilter(NO_FILTER)}
            className="h-7 cursor-pointer border-0 bg-transparent px-2 text-[13px] text-fg-muted underline hover:text-purple"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-fg-subtle tabular-nums">
          {items.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")} loaded
        </span>
      </div>

      <Table
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        rowTitle={(r) => `Open ${r.id} in a new tab`}
        rowClassName={(r) => (openIds.includes(r.id) ? "bg-bg-sub" : undefined)}
        onRowClick={(r, e) => onOpen(r.id, e.metaKey || e.ctrlKey)}
        minWidth={1100}
        empty={loading || error ? undefined : "No transactions match these filters."}
        footer={
          <LoadMore
            onLoadMore={onLoadMore}
            loading={loading}
            done={done}
            error={error}
            onRetry={onRetry}
          />
        }
      />
    </main>
  );
}
