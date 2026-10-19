import { cva } from "class-variance-authority";

import { Card, type Column, StatusLabel, Table } from "@/components";

import { formatAmount, formatTs } from "./queue";
import { useHistory } from "./use-history";

import type { HistoryTransaction } from "./api";
import type { Decision } from "./decisions";
import type { ReactNode } from "react";

type ClientHistoryCardProps = {
  /** The transaction the detail is about: highlighted, not clickable. */
  current: HistoryTransaction;
  /** All of the client's transactions. */
  count: number;
  decisions: Record<string, Decision>;
  onOpen: (id: string, background: boolean) => void;
};

const historyRow = cva("", {
  variants: { current: { true: "bg-sel font-semibold hover:bg-sel" } },
});

const flagged = (h: HistoryTransaction) => h.alertTypes.length > 0;

// The engine keeps `unknown` for remittances, the only transactions with no stated direction.
const directionText = { in: "Incoming", out: "Outgoing", unknown: "Remittance" } as const;

/** One side's "show more" row: a button while more exist, a note while loading, an error with a retry. */
function moreRow(
  side: "older" | "newer",
  { more, loading, error }: { more: boolean; loading: boolean; error: string | null },
  onLoad: () => void,
): ReactNode {
  const word = side === "older" ? "earlier" : "later";
  if (loading) return <span className="text-xs text-fg-subtle">Loading {word}…</span>;
  if (error)
    return (
      <span className="text-xs text-high">
        {error}{" "}
        <button type="button" onClick={onLoad} className={moreButton}>
          Retry
        </button>
      </span>
    );
  if (!more) return null;
  return (
    <button type="button" onClick={onLoad} className={moreButton}>
      Load {word}
    </button>
  );
}

const moreButton =
  "cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-fg underline underline-offset-[0.2em] hover:text-purple";

/**
 * The client's transactions around this one, oldest first, two a side, with buttons for ten more either way;
 * flagged ones open in their own tab.
 */
export function ClientHistoryCard({ current, count, decisions, onOpen }: ClientHistoryCardProps) {
  const currentId = current.id;
  const history = useHistory(currentId);
  const rows = [...history.older.items.toReversed(), current, ...history.newer.items.toReversed()];
  const columns: Column<HistoryTransaction>[] = [
    {
      key: "dt",
      header: "Date and time",
      width: 136,
      className: "tabular-nums text-fg-muted",
      cell: (h) => formatTs(h.ts),
    },
    {
      key: "id",
      header: "Transaction",
      width: 118,
      className: "font-mono text-xs",
      cell: (h) => h.id,
    },
    { key: "dir", header: "Direction", width: 92, cell: (h) => directionText[h.direction] },
    {
      key: "cp",
      header: "Counterparty",
      width: 170,
      className: "text-ellipsis",
      cell: (h) => (
        <>
          <span className="font-mono text-xs">{h.counterpartyAccount ?? "—"}</span>{" "}
          <span className="text-fg-subtle">· {h.counterpartyCountry ?? "—"}</span>
        </>
      ),
    },
    {
      key: "amount",
      header: "Amount (CZK)",
      width: 140,
      align: "right",
      className: "tabular-nums",
      cell: (h) => formatAmount(h.amount),
    },
    {
      key: "alerts",
      header: "Alerts",
      width: 90,
      cell: (h) =>
        flagged(h) ? (
          <span className="font-semibold">{h.alertTypes.join(", ")}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "resolution",
      header: "Resolution",
      className: "text-ellipsis",
      cell: (h) => {
        if (!flagged(h)) return <span className="text-fg-subtle">Not flagged</span>;
        const d = decisions[h.id];
        const note = d?.reason ?? (h.id === currentId ? "this transaction" : "");
        return (
          <span title={note}>
            <StatusLabel status={d?.action ?? "New"} />
            {note && <span className="font-normal text-fg-subtle"> · {note}</span>}
          </span>
        );
      },
    },
  ];

  return (
    <Card
      padded={false}
      title="Client's transactions"
      aside={<span className="text-[11px] text-fg-subtle">{count} in July</span>}
    >
      <Table
        embedded
        columns={columns}
        rows={rows}
        leadRow={moreRow("older", history.older, () => history.load("older"))}
        trailRow={moreRow("newer", history.newer, () => history.load("newer"))}
        rowKey={(h) => h.id}
        minWidth={1000}
        rowClassName={(h) => historyRow({ current: h.id === currentId })}
        rowClickable={(h) => flagged(h) && h.id !== currentId}
        rowTitle={(h) =>
          h.id === currentId ? "This transaction" : flagged(h) ? `Open ${h.id} in a new tab` : ""
        }
        onRowClick={(h, e) => onOpen(h.id, e.metaKey || e.ctrlKey)}
      />
    </Card>
  );
}
