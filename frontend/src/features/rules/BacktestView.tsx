import { cva } from "class-variance-authority";
import { useState } from "react";

import { type Column, LoadMore, RiskBadge, Table } from "@/components";

import { periodDays } from "./format";
import { useBacktestRows, useBacktestSummary } from "./use-backtest";

import type { Backtest, BacktestRow, BacktestView as View } from "./api";
import type { ReactNode } from "react";

/** The views of the rows the engine filters by, with how many rows each has. */
const VIEWS: { id: View; label: string; count: (b: Backtest) => number }[] = [
  {
    id: "all",
    label: "All",
    count: (b) => b.newCount + b.droppedCount + b.changedCount + b.unchangedCount,
  },
  { id: "changed", label: "Changed", count: (b) => b.newCount + b.droppedCount + b.changedCount },
  { id: "new", label: "New", count: (b) => b.newCount },
  { id: "dropped", label: "Dropped", count: (b) => b.droppedCount },
];

const CHANGE_LABEL: Record<BacktestRow["change"], string> = {
  NEW: "New alert",
  RAISED: "Rating raised",
  LOWERED: "Rating lowered",
  DROPPED: "Dropped",
  UNCHANGED: "Unchanged",
};

const changeText = cva("text-[13px]", {
  variants: {
    change: {
      NEW: "font-bold text-med",
      RAISED: "font-semibold text-med",
      LOWERED: "font-semibold text-low",
      DROPPED: "font-semibold text-low",
      UNCHANGED: "text-fg-subtle",
    },
  },
});

const filterTab = cva(
  "flex h-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3 text-[13px]",
  {
    variants: {
      on: {
        true: "font-semibold text-fg shadow-[inset_0_-2px_0_var(--color-fg)]",
        false: "text-fg-muted hover:text-fg",
      },
    },
  },
);

const eyebrow = "text-[10px] font-semibold tracking-[0.08em] text-fg-subtle uppercase";

const rating = (level: BacktestRow["before"]) =>
  level ? <RiskBadge level={level} /> : <span className="text-xs text-fg-subtle">No alert</span>;

/** A draft replayed over a period: how many cases it adds, drops or rates differently, transaction by transaction. */
export function BacktestView({
  draftId,
  onOpen,
}: {
  draftId: number;
  onOpen: (id: string, background: boolean) => void;
}) {
  const summary = useBacktestSummary(draftId);
  const [view, setView] = useState<View>("all");
  const ready = summary.status === "ready" ? summary.data : null;
  const rows = useBacktestRows(draftId, view, ready ? String(ready.createdAt) : null);

  if (summary.status === "loading") return <Waiting title="Loading the backtest…" />;
  if (summary.status === "running") {
    const bt = summary.data;
    const n = periodDays(bt.from, bt.to);
    return (
      <Waiting title={`Backtesting ${bt.ruleKey} v${bt.draftVersion}…`}>
        Replaying {n} {n === 1 ? "day" : "days"} ({bt.from} → {bt.to}) in the background. The whole
        of July takes about a minute; you can leave this tab and come back.
      </Waiting>
    );
  }
  if (summary.status === "none")
    return (
      <Notice>
        This draft has no backtest. Run one from the rules: Backtest. Starting a backtest replaces
        any other draft's.
      </Notice>
    );
  if (summary.status === "failed")
    return (
      <main className="flex flex-1 flex-col items-start gap-2 bg-bg-sub p-6">
        <span role="alert" className="text-[13px] text-high">
          The backtest failed: {summary.message}
        </span>
        <span className="text-[13px] text-fg-muted">Run it again from the rules: Backtest.</span>
      </main>
    );
  if (summary.status === "error")
    return (
      <main className="flex flex-1 flex-col items-start gap-2 bg-bg-sub p-6">
        <span role="alert" className="text-[13px] text-high">
          The backtest could not be loaded: {summary.message}
        </span>
        <button
          type="button"
          onClick={summary.retry}
          className="h-7 cursor-pointer rounded-md border border-border bg-bg px-3 text-xs font-semibold hover:border-fg"
        >
          Retry
        </button>
      </main>
    );

  const bt = summary.data;
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Strip bt={bt} />
      <div
        role="tablist"
        aria-label="Rows"
        className="flex h-9 flex-none items-stretch border-b border-border-soft bg-bg px-2"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={filterTab({ on: view === v.id })}
          >
            <span>{v.label}</span>
            <span className="rounded-full bg-border-soft px-1.5 text-[11px] font-semibold tabular-nums">
              {v.count(bt).toLocaleString("en-US")}
            </span>
          </button>
        ))}
      </div>
      <Table
        columns={columnsFor(bt)}
        rows={rows.items}
        rowKey={(r) => r.id}
        minWidth={960}
        onRowClick={(r, e) => onOpen(r.id, e.metaKey || e.ctrlKey)}
        rowTitle={(r) => `Open ${r.id} in a new tab`}
        empty={rows.loading || rows.error ? undefined : "No transactions in this view."}
        footer={
          <LoadMore
            onLoadMore={rows.loadMore}
            loading={rows.loading}
            done={rows.done}
            error={rows.error}
            onRetry={rows.retry}
          />
        }
      />
    </main>
  );
}

/** A spinner in the middle of the tab while the backtest loads or the engine is still replaying. */
function Waiting({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main
      role="status"
      className="flex flex-1 flex-col items-center justify-center gap-3 bg-bg-sub p-6 text-center"
    >
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-[3px] border-border border-t-purple motion-reduce:animate-none"
      />
      <span className="text-sm font-semibold">{title}</span>
      {children && (
        <span className="max-w-[420px] text-[13px] text-pretty text-fg-muted">{children}</span>
      )}
    </main>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <main role="status" className="flex-1 bg-bg-sub p-6 text-[13px] text-fg-muted italic">
      {children}
    </main>
  );
}

/** The fixed strip over the rows: which rule and versions, the period, and the impact in numbers. */
function Strip({ bt }: { bt: Backtest }) {
  const n = periodDays(bt.from, bt.to);
  const impact = [
    [bt.newCount, "new"],
    [bt.droppedCount, "dropped"],
    [bt.changedCount, "rating changed"],
  ] as const;
  return (
    <div className="flex flex-none items-stretch gap-0 bg-bg py-3 shadow-strip">
      <div className="flex min-w-0 flex-col gap-1 px-6 pl-4">
        <span className={eyebrow}>Backtest</span>
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="font-mono text-lg font-semibold">{bt.ruleKey}</span>
          <span className="text-[13px] text-fg-muted">
            {bt.activeVersion
              ? `v${bt.activeVersion} active → v${bt.draftVersion} draft`
              : `v${bt.draftVersion} draft · new rule`}
          </span>
        </span>
        {bt.ruleName && (
          <span className="max-w-[360px] truncate text-xs text-fg-muted" title={bt.ruleName}>
            {bt.ruleName}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 border-l border-border-soft px-6">
        <span className={eyebrow}>Period</span>
        <span className="text-lg font-semibold tabular-nums">
          {n} {n === 1 ? "day" : "days"}
        </span>
        <span className="text-xs text-fg-muted tabular-nums">
          {bt.from} → {bt.to}
        </span>
      </div>
      <div className="flex flex-col gap-1 border-l border-border-soft px-6">
        <span className={eyebrow}>Impact</span>
        <span className="flex items-baseline gap-4 text-lg font-bold tabular-nums">
          {impact.map(([value, label]) => (
            <span key={label}>
              {value.toLocaleString("en-US")}
              <span className="ml-1 text-xs font-medium text-fg-muted">{label}</span>
            </span>
          ))}
        </span>
        <span className="text-xs text-fg-muted tabular-nums">
          {bt.unchangedCount.toLocaleString("en-US")} unchanged ·{" "}
          {bt.transactions.toLocaleString("en-US")} transactions replayed
        </span>
      </div>
    </div>
  );
}

const columnsFor = (bt: Backtest): Column<BacktestRow>[] => [
  {
    key: "id",
    header: "Transaction",
    width: 130,
    className: "font-mono text-xs",
    cell: (r) => r.id,
  },
  {
    key: "client",
    header: "Client",
    width: 96,
    className: "font-mono text-xs text-fg-muted",
    cell: (r) => r.clientId,
  },
  {
    key: "amount",
    header: "Amount (CZK)",
    width: 130,
    align: "right",
    className: "tabular-nums",
    cell: (r) => r.amount.toLocaleString("en-US", { minimumFractionDigits: 2 }),
  },
  {
    key: "ts",
    header: "Date and time",
    width: 140,
    className: "text-fg-muted tabular-nums",
    cell: (r) => r.ts.slice(0, 16).replace("T", " "),
  },
  {
    key: "before",
    header: `Before · v${bt.activeVersion ?? "–"}`,
    width: 120,
    cell: (r) => rating(r.before),
  },
  { key: "arrow", header: "", width: 28, className: "text-fg-subtle", cell: () => "→" },
  { key: "after", header: `After · v${bt.draftVersion}`, width: 120, cell: (r) => rating(r.after) },
  {
    key: "change",
    header: "Change",
    className: "text-ellipsis",
    cell: (r) => (
      <span title={r.note ?? undefined}>
        <span className={changeText({ change: r.change })}>{CHANGE_LABEL[r.change]}</span>
        {r.note && <span className="text-xs text-fg-subtle"> · {r.note}</span>}
      </span>
    ),
  },
];
