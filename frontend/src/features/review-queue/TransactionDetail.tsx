import { cva } from "class-variance-authority";

import {
  AiPill,
  aiDisagreement,
  Card,
  type Column,
  RiskBadge,
  riskText,
  StatusLabel,
  Table,
} from "@/components";
import { cn } from "@/utils";

import { ClientCard } from "./ClientCard";
import { DecisionPanel } from "./DecisionPanel";
import { clientHistory, CLIENTS, type HistoryTx, PAST_FLAGS, TX_DETAILS } from "./detail-mock";
import { DetailStrip } from "./DetailStrip";
import { MoneyFlow } from "./MoneyFlow";
import { formatAmount, type QueueItem } from "./queue";

import type { Decision } from "./decisions";

type TransactionDetailProps = {
  item: QueueItem;
  /** The whole queue (decisions applied), to mark the client's other flagged transactions. */
  queue: QueueItem[];
  decisions: Record<string, Decision>;
  onDecide: (action: Decision["action"], reason: string) => void;
  onUndo: () => void;
  onOpen: (id: string, background: boolean) => void;
};

const historyRow = cva("", {
  variants: { current: { true: "bg-sel font-semibold hover:bg-sel" } },
});

export function TransactionDetail({
  item,
  queue,
  decisions,
  onDecide,
  onUndo,
  onOpen,
}: TransactionDetailProps) {
  const tx = TX_DETAILS[item.id];
  const client = CLIENTS[item.client];
  if (!tx || !client) {
    return (
      <main className="flex flex-1 items-center justify-center text-fg-subtle">
        No detail data for {item.id}.
      </main>
    );
  }

  const queued = new Map(queue.map((q) => [q.id, q]));
  const history = clientHistory(item.client);
  const day = item.date.slice(0, 10);
  const dayTx = history
    .filter((h) => h.dt.startsWith(day))
    .toSorted((a, b) => (a.dt > b.dt ? 1 : -1));
  const disagree = aiDisagreement(item.rule, item.ai);
  const flagOf = (h: HistoryTx) => {
    const q = queued.get(h.id);
    const note = decisions[h.id]?.reason ?? (h.id === item.id ? "this transaction" : "");
    if (q) return { rule: q.rule, status: q.status, note };
    const past = PAST_FLAGS[h.id];
    return past ? { rule: past.rule, status: "Closed" as const, note: past.note } : null;
  };

  const historyColumns: Column<HistoryTx>[] = [
    {
      key: "dt",
      header: "Date and time",
      width: 136,
      className: "tabular-nums text-fg-muted",
      cell: (h) => h.dt,
    },
    {
      key: "id",
      header: "Transaction",
      width: 118,
      className: "font-mono text-xs",
      cell: (h) => h.id,
    },
    {
      key: "dir",
      header: "Direction",
      width: 92,
      cell: (h) => (h.dir === "Remittance" ? "Unknown" : h.dir),
    },
    {
      key: "cp",
      header: "Counterparty",
      width: 170,
      className: "text-ellipsis",
      cell: (h) => (
        <>
          <span className="font-mono text-xs">{h.counterparty}</span>{" "}
          <span className="text-fg-subtle">· {h.country}</span>
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
      key: "rule",
      header: "Rule rating",
      width: 110,
      cell: (h) => {
        const f = flagOf(h);
        return f ? <RiskBadge level={f.rule} /> : <span className="text-fg-subtle">—</span>;
      },
    },
    {
      key: "resolution",
      header: "Resolution",
      className: "text-ellipsis",
      cell: (h) => {
        const f = flagOf(h);
        if (!f) return <span className="text-fg-subtle">Not flagged</span>;
        return (
          <span title={f.note}>
            <StatusLabel status={f.status} />
            {f.note && <span className="font-normal text-fg-subtle"> · {f.note}</span>}
          </span>
        );
      },
    },
  ];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DetailStrip item={item} tx={tx} client={client} />

      <div className="min-h-0 flex-1 overflow-auto bg-bg-sub">
        <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-3 px-4 pt-3 pb-4">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
              <Card title="Rule rating">
                <div className="flex items-center gap-2.5">
                  <RiskBadge level={item.rule} />
                  <span className="text-sm font-semibold text-pretty">{item.ruleReason}</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-t border-border-soft pt-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-fg-subtle">Rule fired</span>
                    <span>{tx.ruleName}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-fg-subtle">Threshold</span>
                    <span className="text-fg-muted tabular-nums">{tx.limit}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-fg-subtle">Actual</span>
                    <span className={cn("font-bold tabular-nums", riskText({ level: item.rule }))}>
                      {tx.actual}
                    </span>
                  </div>
                </div>
              </Card>

              <Card tone="ai" title="AI rating" className="gap-2">
                <div className="flex items-center gap-2">
                  <AiPill rating={item.ai} />
                  {disagree && (
                    <span className="rounded-[3px] bg-fg px-[5px] text-[11px] leading-4 font-semibold text-bg">
                      ≠ {disagree} than rule
                    </span>
                  )}
                </div>
                {item.ai === "failed" ? (
                  <p className="m-0 text-[13px] leading-normal text-fg-muted">
                    The AI assessment could not be completed for this transaction. Review it based
                    on the rule rating.
                  </p>
                ) : item.ai !== "running" ? (
                  <p className="m-0 text-[13px] leading-normal text-pretty text-fg">{tx.aiText}</p>
                ) : null}
              </Card>
            </div>

            <Card
              title="Money flow"
              className="gap-2"
              aside={
                <>
                  <span className="text-[11px] text-fg-subtle">
                    {new Date(`${day}T12:00`).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {dayTx.length} {dayTx.length === 1 ? "transaction" : "transactions"}
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-[11px] text-fg-subtle">
                    <span className="flex items-center gap-[5px]">
                      <span className="h-1.5 w-3.5 rounded-[1px] bg-yellow" />
                      This transaction
                    </span>
                    <span className="flex items-center gap-[5px]">
                      <span className="h-1.5 w-3.5 rounded-[1px] bg-flow" />
                      Other that day
                    </span>
                    <span>Line width = amount</span>
                  </span>
                </>
              }
            >
              <div className="flex justify-center">
                <MoneyFlow day={dayTx} currentId={item.id} clientId={item.client} />
              </div>
            </Card>

            <Card
              padded={false}
              title="Client's recent transactions"
              aside={<span className="text-[11px] text-fg-subtle">last {history.length}</span>}
            >
              <Table
                embedded
                columns={historyColumns}
                rows={history}
                rowKey={(h) => h.id}
                minWidth={1000}
                rowClassName={(h) => historyRow({ current: h.id === item.id })}
                rowClickable={(h) => queued.has(h.id) && h.id !== item.id}
                rowTitle={(h) =>
                  h.id === item.id
                    ? "This transaction"
                    : queued.has(h.id)
                      ? `Open ${h.id} in a new tab`
                      : ""
                }
                onRowClick={(h, e) => onOpen(h.id, e.metaKey || e.ctrlKey)}
              />
            </Card>
          </div>

          <div className="sticky top-3 flex flex-col gap-3">
            <ClientCard id={item.client} client={client} />

            <DecisionPanel decision={decisions[item.id]} onDecide={onDecide} onUndo={onUndo} />
          </div>
        </div>
      </div>
    </main>
  );
}
