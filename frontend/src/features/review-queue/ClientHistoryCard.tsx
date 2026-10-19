import { cva } from "class-variance-authority";

import { Card, type Column, StatusLabel, Table } from "@/components";

import { czk, type HistoryTransaction } from "./api";
import { formatAmount, formatTs } from "./queue";

import type { Decision } from "./decisions";

type ClientHistoryCardProps = {
  history: HistoryTransaction[];
  /** The transaction the detail is about: highlighted, not clickable. */
  currentId: string;
  decisions: Record<string, Decision>;
  onOpen: (id: string, background: boolean) => void;
};

const historyRow = cva("", {
  variants: { current: { true: "bg-sel font-semibold hover:bg-sel" } },
});

const flagged = (h: HistoryTransaction) => h.alertTypes.length > 0;

const directionText = { in: "Incoming", out: "Outgoing", unknown: "Unknown" } as const;

/** All of the client's transactions in the period; flagged ones open in their own tab. */
export function ClientHistoryCard({
  history,
  currentId,
  decisions,
  onOpen,
}: ClientHistoryCardProps) {
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
      cell: (h) => formatAmount(czk(h.amountHalere)),
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
      aside={<span className="text-[11px] text-fg-subtle">{history.length} in July</span>}
    >
      <Table
        embedded
        columns={columns}
        rows={history}
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
