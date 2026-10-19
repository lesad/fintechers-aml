import { Card, RiskBadge, type RiskLevel, riskText } from "@/components";
import { cn } from "@/utils";

import { type RuleFacts, rulesSummary } from "./rules";
import { TriageSummary } from "./TriageSummary";

import type { TransactionDetail } from "./api";

type RuleRatingCardProps = {
  rating: RiskLevel | null;
  ruleNames: readonly string[];
  /** The hit furthest over its threshold. */
  facts: RuleFacts | null;
  alertTypes: string[];
  triage: TransactionDetail["alerts"][number]["triage"];
};

/** What the rules found: the rating, the strongest rule's threshold vs actual, and triage's score. */
export function RuleRatingCard({
  rating,
  ruleNames,
  facts,
  alertTypes,
  triage,
}: RuleRatingCardProps) {
  return (
    <Card title="Rule rating">
      {rating ? (
        <>
          <div className="flex items-center gap-2.5">
            <RiskBadge level={rating} />
            <span className="text-sm font-semibold text-pretty">{rulesSummary(ruleNames)}</span>
          </div>
          {facts && (
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-t border-border-soft pt-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-fg-subtle">Rule fired</span>
                <span>
                  {facts.rule} · alert {alertTypes.join(", ")}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-fg-subtle">Threshold</span>
                <span className="text-fg-muted tabular-nums">{facts.threshold}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-fg-subtle">Actual</span>
                <span className={cn("font-bold tabular-nums", riskText({ level: rating }))}>
                  {facts.actual}
                </span>
              </div>
            </div>
          )}
          {triage && <TriageSummary triage={triage} />}
        </>
      ) : (
        <span className="text-[13px] text-fg-muted">
          The latest run raised no alert on this transaction.
        </span>
      )}
    </Card>
  );
}
