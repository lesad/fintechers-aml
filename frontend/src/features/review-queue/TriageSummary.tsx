import { DISPOSITION_LABEL } from "./queue";

import type { TransactionDetail } from "./api";

type Triage = NonNullable<TransactionDetail["alerts"][number]["triage"]>;

/** The engine's triage in one line: what should happen to the case, its score and the config that decided. */
export function TriageSummary({ triage }: { triage: Triage }) {
  return (
    <div className="flex items-baseline gap-2 border-t border-border-soft pt-2.5">
      <span className="text-[11px] text-fg-subtle">Triage</span>
      <span className="text-[13px] font-semibold">{DISPOSITION_LABEL[triage.disposition]}</span>
      <span className="ml-auto text-xs text-fg-muted tabular-nums">
        score <b className="text-fg">{triage.score}</b> / 100 · {triage.configVersion}
      </span>
    </div>
  );
}
