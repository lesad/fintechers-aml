import { cva } from "class-variance-authority";
import { useState } from "react";

import { type Column, RatingBadge, Select, StatusLabel, Table } from "@/components";

import { MOCK_NOW } from "./mock";
import {
  filterQueue,
  formatAge,
  formatAmount,
  NO_FILTER,
  type QueueFilter,
  type QueueItem,
} from "./queue";

type ReviewQueueProps = {
  items: QueueItem[];
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

export function ReviewQueue({ items, openIds, onOpen }: ReviewQueueProps) {
  const [filter, setFilter] = useState<QueueFilter>(NO_FILTER);
  const rows = filterQueue(items, filter);
  const hasFilters = filter.query !== "" || filter.rating !== "all" || filter.status !== "all";

  const columns: Column<QueueItem>[] = [
    {
      key: "rating",
      header: "Rating",
      width: 210,
      cell: (r) => <RatingBadge rule={r.rule} ai={r.ai} />,
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
      header: "Flagged ↑",
      width: 84,
      align: "right",
      className: "tabular-nums",
      cell: (r) => {
        const closed = r.status === "Closed";
        const overdue = MOCK_NOW.getTime() - r.flagged.getTime() > 72 * 3_600_000;
        const state = closed ? "closed" : overdue ? "overdue" : "open";
        return <span className={age({ state })}>{formatAge(r.flagged, MOCK_NOW)}</span>;
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
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          className="h-7 w-[260px] rounded border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25"
        />
        <Select
          aria-label="Rule rating"
          value={filter.rating}
          onChange={(e) =>
            setFilter({ ...filter, rating: e.target.value as QueueFilter["rating"] })
          }
        >
          <option value="all">All rule ratings</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </Select>
        <Select
          aria-label="Status"
          value={filter.status}
          onChange={(e) =>
            setFilter({ ...filter, status: e.target.value as QueueFilter["status"] })
          }
        >
          <option value="all">All statuses</option>
          <option value="open">Open (not closed)</option>
          <option value="New">New</option>
          <option value="In review">In review</option>
          <option value="Escalated">Escalated</option>
          <option value="Closed">Closed</option>
        </Select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setFilter(NO_FILTER)}
            className="h-7 cursor-pointer border-0 bg-transparent px-2 text-[13px] text-fg-muted underline hover:text-purple"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-fg-subtle">
          {hasFilters
            ? `${rows.length} of ${items.length} transactions`
            : `${rows.length} transactions`}
        </span>
      </div>

      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowTitle={(r) => `Open ${r.id} in a new tab`}
        rowClassName={(r) => (openIds.includes(r.id) ? "bg-bg-sub" : undefined)}
        onRowClick={(r, e) => onOpen(r.id, e.metaKey || e.ctrlKey)}
        minWidth={960}
        empty="No transactions match these filters."
      />
    </main>
  );
}
