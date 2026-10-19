import { cva } from "class-variance-authority";

import { Modal } from "@/components";

import { DISPOSITION_LABEL } from "./queue";

import type { TransactionDetail } from "./api";

type Triage = NonNullable<TransactionDetail["alerts"][number]["triage"]>;

const pointsBar = cva("absolute inset-y-0 rounded-[1px]", {
  variants: { negative: { true: "bg-fg-subtle", false: "bg-fg" } },
});

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** The engine's triage score and every reason it gave, with its points; nothing computed here. */
export function TriageBreakdown({
  txId,
  triage,
  onClose,
}: {
  txId: string;
  triage: Triage;
  onClose: () => void;
}) {
  // Half the bar track = the reason with the most points, either way.
  const max = Math.max(1, ...triage.reasons.map((r) => Math.abs(r.points)));
  // Reasons worth no points changed nothing about the score.
  const scoring = triage.reasons.filter((r) => r.points !== 0);

  return (
    <Modal
      label="Triage score breakdown"
      onClose={onClose}
      header={
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
              Triage score · {txId}
            </span>
            <span className="flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-[28px] leading-[1.1] font-bold tabular-nums">
                {triage.score}
              </span>
              <span className="text-sm text-fg-muted">
                /100 · {DISPOSITION_LABEL[triage.disposition]}
              </span>
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-[2px] bg-border-soft">
            <span
              className="absolute inset-y-0 left-0 bg-fg"
              style={{ width: `${triage.score}%` }}
            />
          </div>
        </div>
      }
    >
      <div className="px-[18px] pt-1.5 pb-1">
        {scoring.map((r) => (
          <div
            key={r.code}
            className="grid h-[30px] grid-cols-[minmax(0,1fr)_120px_44px] items-center gap-3 border-b border-border-soft text-[13px]"
          >
            <span className="truncate" title={r.description}>
              {r.description}
            </span>
            <span className="relative h-1.5">
              <span className="absolute -inset-y-1 left-1/2 w-px bg-border" />
              <span
                className={pointsBar({ negative: r.points < 0 })}
                style={{
                  width: `${(Math.abs(r.points) / max) * 50}%`,
                  left: r.points < 0 ? `${50 - (Math.abs(r.points) / max) * 50}%` : "50%",
                }}
              />
            </span>
            <span className="text-right font-bold tabular-nums">{signed(r.points)}</span>
          </div>
        ))}
        <div className="grid h-[34px] grid-cols-[minmax(0,1fr)_120px_44px] items-center gap-3 text-[13px] font-bold">
          <span>Total</span>
          <span />
          <span className="text-right tabular-nums">{triage.score}</span>
        </div>
      </div>
    </Modal>
  );
}
