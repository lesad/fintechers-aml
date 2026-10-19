import { cva } from "class-variance-authority";

import { type CaseStatus, StatusLabel } from "@/components";
import { cn } from "@/utils";

import { czk, type TransactionDetail } from "./api";
import { formatAge, formatAmount, formatTs } from "./queue";

const eyebrow = "text-[10px] font-semibold tracking-[0.08em] text-fg-subtle uppercase";

const stripBlock = cva("flex min-w-0 flex-col gap-1 px-6", {
  variants: {
    first: { true: "flex-none pl-4", false: "border-l border-border-soft" },
    grow: { true: "flex-auto", false: "flex-none" },
  },
  defaultVariants: { first: false, grow: false },
});

const directionLabel = {
  in: "Incoming",
  out: "Outgoing",
  unknown: "Remittance · direction unknown",
} as const;

/** `legal entity` → `Legal entity` */
const sentence = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/** The detail's fixed top strip: transaction, amount, who paid whom, case status. */
export function DetailStrip({
  detail,
  status,
  flagged,
}: {
  detail: TransactionDetail;
  status: CaseStatus | null;
  flagged: Date | null;
}) {
  const { transaction: tx, client } = detail;
  const clientSide = { account: client.id, sub: `Client · ${sentence(client.type)}` };
  const parties =
    tx.direction === "in"
      ? {
          from: { account: tx.payerAccount ?? "—", sub: `Payer · ${tx.payerCountry ?? "—"}` },
          to: clientSide,
          arrow: "→",
        }
      : {
          from: clientSide,
          to: {
            account: tx.payeeAccount ?? "—",
            sub: `${tx.direction === "out" ? "Payee" : "Counterparty"} · ${tx.payeeCountry ?? "—"}`,
          },
          arrow: tx.direction === "out" ? "→" : "↔",
        };

  return (
    <div className="relative z-[1] flex flex-none items-stretch overflow-x-auto bg-bg py-3 shadow-strip">
      <div className={stripBlock({ first: true })}>
        <span className={eyebrow}>Transaction</span>
        <span className="font-mono text-lg leading-tight font-semibold tracking-[-0.01em]">
          {tx.id}
        </span>
        <span className="text-xs whitespace-nowrap text-fg-muted tabular-nums">
          {formatTs(tx.ts)}
        </span>
      </div>
      <div className={stripBlock()}>
        <span className={eyebrow}>Amount</span>
        <span className="text-lg leading-tight font-semibold whitespace-nowrap tabular-nums">
          {formatAmount(czk(tx.amountHalere))}{" "}
          <span className="text-[13px] font-medium text-fg-muted">CZK</span>
        </span>
        <span className="text-xs whitespace-nowrap text-fg-muted tabular-nums">
          {tx.currency === "CZK"
            ? "original CZK"
            : `original ${tx.currency} ${formatAmount(tx.volume)} · rate ${tx.fxRate}`}
        </span>
      </div>
      <div className={stripBlock({ grow: true })}>
        <span className={eyebrow}>{directionLabel[tx.direction]}</span>
        <div className="flex items-center gap-3 whitespace-nowrap">
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-sm font-semibold">{parties.from.account}</span>
            <span className="text-xs text-fg-muted">{parties.from.sub}</span>
          </div>
          <span className="text-base font-bold text-fg-subtle">{parties.arrow}</span>
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-sm font-semibold">{parties.to.account}</span>
            <span className="text-xs text-fg-muted">{parties.to.sub}</span>
          </div>
        </div>
      </div>
      <div className={cn(stripBlock(), "items-start pr-4")}>
        <span className={eyebrow}>Case</span>
        {status ? (
          <StatusLabel status={status} boxed />
        ) : (
          <span className="text-xs">Not flagged</span>
        )}
        {flagged && (
          <span className="text-xs whitespace-nowrap text-fg-muted">
            flagged <b className="text-fg tabular-nums">{formatAge(flagged, new Date())}</b> ago
          </span>
        )}
      </div>
    </div>
  );
}
