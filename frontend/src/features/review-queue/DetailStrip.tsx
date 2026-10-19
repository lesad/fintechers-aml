import { cva } from "class-variance-authority";

import { StatusLabel } from "@/components";
import { cn } from "@/utils";

import { type Client, COUNTRIES, type TxDetail } from "./detail-mock";
import { MOCK_NOW } from "./mock";
import { formatAge, formatAmount, type QueueItem } from "./queue";

const eyebrow = "text-[10px] font-semibold tracking-[0.08em] text-fg-subtle uppercase";

const stripBlock = cva("flex min-w-0 flex-col gap-1 px-6", {
  variants: {
    first: { true: "flex-none pl-4", false: "border-l border-border-soft" },
    grow: { true: "flex-auto", false: "flex-none" },
  },
  defaultVariants: { first: false, grow: false },
});

const directionLabel = {
  Incoming: "Incoming",
  Outgoing: "Outgoing",
  Remittance: "Remittance · direction unknown",
} as const;

/** The detail's fixed top strip: transaction, amount, who paid whom, case status. */
export function DetailStrip({
  item,
  tx,
  client,
}: {
  item: QueueItem;
  tx: TxDetail;
  client: Client;
}) {
  const country = COUNTRIES[tx.country] ?? tx.country;

  const parties =
    tx.dir === "Incoming"
      ? {
          from: tx.counterparty,
          fromSub: `Payer · ${country}`,
          to: item.client,
          toSub: `Client · ${client.type}`,
          arrow: "→",
        }
      : {
          from: item.client,
          fromSub: `Client · ${client.type}`,
          to: tx.counterparty,
          toSub: `${tx.dir === "Outgoing" ? "Payee" : "Counterparty"} · ${country}`,
          arrow: tx.dir === "Outgoing" ? "→" : "↔",
        };

  return (
    <div className="relative z-[1] flex flex-none items-stretch overflow-x-auto bg-bg py-3 shadow-strip">
      <div className={stripBlock({ first: true })}>
        <span className={eyebrow}>Transaction</span>
        <span className="font-mono text-lg leading-tight font-semibold tracking-[-0.01em]">
          {item.id}
        </span>
        <span className="text-xs whitespace-nowrap text-fg-muted tabular-nums">{item.date}</span>
      </div>
      <div className={stripBlock()}>
        <span className={eyebrow}>Amount</span>
        <span className="text-lg leading-tight font-semibold whitespace-nowrap tabular-nums">
          {formatAmount(item.amount)}{" "}
          <span className="text-[13px] font-medium text-fg-muted">CZK</span>
        </span>
        <span className="text-xs whitespace-nowrap text-fg-muted tabular-nums">
          {tx.original
            ? `original ${tx.original.currency} ${formatAmount(tx.original.amount)}`
            : "original CZK"}
        </span>
      </div>
      <div className={stripBlock({ grow: true })}>
        <span className={eyebrow}>{directionLabel[tx.dir]}</span>
        <div className="flex items-center gap-3 whitespace-nowrap">
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-sm font-semibold">{parties.from}</span>
            <span className="text-xs text-fg-muted">{parties.fromSub}</span>
          </div>
          <span className="text-base font-bold text-fg-subtle">{parties.arrow}</span>
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-sm font-semibold">{parties.to}</span>
            <span className="text-xs text-fg-muted">{parties.toSub}</span>
          </div>
        </div>
      </div>
      <div className={cn(stripBlock(), "items-start pr-4")}>
        <span className={eyebrow}>Case</span>
        <StatusLabel status={item.status} boxed />
        <span className="text-xs whitespace-nowrap text-fg-muted">
          flagged <b className="text-fg tabular-nums">{formatAge(item.flagged, MOCK_NOW)}</b> ago
        </span>
      </div>
    </div>
  );
}
