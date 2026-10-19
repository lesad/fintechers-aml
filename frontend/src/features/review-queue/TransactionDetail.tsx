import { cva } from "class-variance-authority";

import { AiPill, Card, type Column, RiskBadge, riskText, StatusLabel, Table } from "@/components";
import { cn } from "@/utils";

import { czk, type HistoryTransaction, type TransactionDetail as Detail } from "./api";
import { ClientCard } from "./ClientCard";
import { DecisionPanel } from "./DecisionPanel";
import { DetailStrip } from "./DetailStrip";
import { type FlowTx, MoneyFlow } from "./MoneyFlow";
import { formatAmount, formatTs } from "./queue";
import { rulesSummary, strongestFacts } from "./rules";
import { useDetail } from "./use-detail";

import type { Decision } from "./decisions";

type TransactionDetailProps = {
  id: string;
  decisions: Record<string, Decision>;
  onDecide: (action: Decision["action"], reason: string, rating: Detail["rating"]) => void;
  onUndo: () => void;
  onOpen: (id: string, background: boolean) => void;
};

const historyRow = cva("", {
  variants: { current: { true: "bg-sel font-semibold hover:bg-sel" } },
});

const toFlow = (h: HistoryTransaction): FlowTx => ({
  id: h.id,
  dt: formatTs(h.ts),
  dir: h.direction === "in" ? "Incoming" : h.direction === "out" ? "Outgoing" : "Remittance",
  counterparty: h.counterpartyAccount ?? "—",
  country: h.counterpartyCountry ?? "—",
  amount: czk(h.amountHalere),
});

const flaggedRow = (h: HistoryTransaction) => h.alertTypes.length > 0;

const directionText = { in: "Incoming", out: "Outgoing", unknown: "Unknown" } as const;

/** Loads one transaction from the engine and shows it; the decision stays in the browser. */
export function TransactionDetail({ id, ...rest }: TransactionDetailProps) {
  const detail = useDetail(id);
  if (detail.status === "ready") return <DetailView detail={detail.data} {...rest} />;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 text-fg-subtle">
      {detail.status === "loading" && (
        <>
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-border border-t-purple"
          />
          <span role="status">Loading {id}…</span>
        </>
      )}
      {detail.status === "not-found" && <span>Transaction {id} was not found.</span>}
      {detail.status === "error" && (
        <>
          <span className="text-high">
            Could not load {id}: {detail.message}
          </span>
          <button
            type="button"
            onClick={detail.retry}
            className="cursor-pointer border-0 bg-transparent p-0 text-xs text-fg-muted underline hover:text-purple"
          >
            Retry
          </button>
        </>
      )}
    </main>
  );
}

function DetailView({
  detail,
  decisions,
  onDecide,
  onUndo,
  onOpen,
}: Omit<TransactionDetailProps, "id"> & { detail: Detail }) {
  const { transaction: tx, client, rating, alerts } = detail;
  const decision = decisions[tx.id];
  const hits = alerts.flatMap((a) => a.hits);
  const facts = strongestFacts(hits, client);
  const ruleKeys = [...new Set(hits.map((h) => h.rule))].toSorted();
  const flaggedAt = alerts[0] ? new Date(alerts[0].createdAt) : null;
  const status = rating ? (decision?.action ?? "New") : null;

  const day = tx.ts.slice(0, 10);
  const dayTx = detail.history
    .filter((h) => h.ts.startsWith(day))
    .map(toFlow)
    .toSorted((a, b) => (a.dt > b.dt ? 1 : -1));

  const historyColumns: Column<HistoryTransaction>[] = [
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
        flaggedRow(h) ? (
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
        if (!flaggedRow(h)) return <span className="text-fg-subtle">Not flagged</span>;
        const d = decisions[h.id];
        const note = d?.reason ?? (h.id === tx.id ? "this transaction" : "");
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
    <main className="flex min-h-0 flex-1 flex-col">
      <DetailStrip detail={detail} status={status} flagged={flaggedAt} />

      <div className="min-h-0 flex-1 overflow-auto bg-bg-sub">
        <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-3 px-4 pt-3 pb-4">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
              <Card title="Rule rating">
                {rating ? (
                  <>
                    <div className="flex items-center gap-2.5">
                      <RiskBadge level={rating} />
                      <span className="text-sm font-semibold text-pretty">
                        {rulesSummary(ruleKeys)}
                      </span>
                    </div>
                    {facts && (
                      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-t border-border-soft pt-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-fg-subtle">Rule fired</span>
                          <span>
                            {facts.rule} · alert {alerts.map((a) => a.alertType).join(", ")}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-fg-subtle">Threshold</span>
                          <span className="text-fg-muted tabular-nums">{facts.threshold}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-fg-subtle">Actual</span>
                          <span
                            className={cn("font-bold tabular-nums", riskText({ level: rating }))}
                          >
                            {facts.actual}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-[13px] text-fg-muted">
                    The latest run raised no alert on this transaction.
                  </span>
                )}
              </Card>

              <Card tone="ai" title="AI rating" className="gap-2">
                <div className="flex items-center gap-2">
                  <AiPill rating="none" />
                </div>
                <p className="m-0 text-[13px] leading-normal text-fg-muted">
                  No model rates cases (ADR-0032). An AI summary for the reviewer will appear here.
                </p>
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
                <MoneyFlow day={dayTx} currentId={tx.id} clientId={client.id} />
              </div>
            </Card>

            <Card
              padded={false}
              title="Client's transactions"
              aside={
                <span className="text-[11px] text-fg-subtle">{detail.history.length} in July</span>
              }
            >
              <Table
                embedded
                columns={historyColumns}
                rows={detail.history}
                rowKey={(h) => h.id}
                minWidth={1000}
                rowClassName={(h) => historyRow({ current: h.id === tx.id })}
                rowClickable={(h) => flaggedRow(h) && h.id !== tx.id}
                rowTitle={(h) =>
                  h.id === tx.id
                    ? "This transaction"
                    : flaggedRow(h)
                      ? `Open ${h.id} in a new tab`
                      : ""
                }
                onRowClick={(h, e) => onOpen(h.id, e.metaKey || e.ctrlKey)}
              />
            </Card>
          </div>

          <div className="sticky top-3 flex flex-col gap-3">
            <ClientCard client={client} />
            {rating && (
              <DecisionPanel
                decision={decision}
                onDecide={(action, reason) => onDecide(action, reason, rating)}
                onUndo={onUndo}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
