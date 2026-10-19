import { Card, RiskBadge, type RiskLevel } from "@/components";

import { type RuleThresholds, rulesSummary } from "./rules";

import type { TransactionDetail } from "./api";

type RuleRatingCardProps = {
  rating: RiskLevel | null;
  ruleNames: readonly string[];
  /** Each rule's parameters, as the engine stored them. */
  thresholds: RuleThresholds[];
  alertTypes: string[];
  triage: TransactionDetail["alerts"][number]["triage"];
};

/** What the rules found: the rating and each rule's thresholds verbatim; triage's score top right. */
export function RuleRatingCard({
  rating,
  ruleNames,
  thresholds,
  alertTypes,
  triage,
}: RuleRatingCardProps) {
  return (
    <Card
      title="Rule rating"
      aside={
        triage && (
          <span className="ml-auto text-xs text-fg-muted tabular-nums">
            score <b className="text-fg">{triage.score}</b> / 100
          </span>
        )
      }
    >
      {rating ? (
        <>
          <div className="flex items-center gap-2.5">
            <RiskBadge level={rating} />
            <span className="text-sm font-semibold text-pretty">{rulesSummary(ruleNames)}</span>
          </div>
          {thresholds.map((t) => (
            <div
              key={t.rule}
              className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] gap-3 border-t border-border-soft pt-2.5"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-fg-subtle">Rule fired</span>
                <span>
                  {t.rule} · alert {alertTypes.join(", ")}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-fg-subtle">Threshold</span>
                {t.params.map(([k, v]) => (
                  <span key={k} className="text-fg-muted tabular-nums">
                    {k} {v}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <span className="text-[13px] text-fg-muted">
          The latest run raised no alert on this transaction.
        </span>
      )}
    </Card>
  );
}
