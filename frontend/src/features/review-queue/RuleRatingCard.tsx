import { cva } from "class-variance-authority";

import { Card, RiskBadge, type RiskLevel } from "@/components";

import { type RuleThresholds, rulesSummary } from "./rules";

const rulesRow = cva("grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] gap-3 py-1", {
  variants: { first: { false: "border-t border-border-soft" } },
});

type RuleRatingCardProps = {
  rating: RiskLevel | null;
  ruleNames: readonly string[];
  /** Each rule's parameters, as the engine stored them. */
  thresholds: RuleThresholds[];
  alertTypes: string[];
};

/** What the rules found: the rating and each rule's thresholds verbatim. */
export function RuleRatingCard({ rating, ruleNames, thresholds, alertTypes }: RuleRatingCardProps) {
  return (
    <Card title="Rule rating">
      {rating ? (
        <>
          <div className="flex items-center gap-2.5">
            <RiskBadge level={rating} />
            <span className="text-sm font-semibold text-pretty">{rulesSummary(ruleNames)}</span>
          </div>
          {thresholds.length > 0 && (
            <div className="flex flex-col border-t border-border-soft">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] gap-3 pt-2 pb-1 text-[11px] text-fg-subtle">
                <span>{thresholds.length > 1 ? "Rules fired" : "Rule fired"}</span>
                <span>Threshold</span>
              </div>
              {thresholds.map((t, i) => (
                <div key={t.rule} className={rulesRow({ first: i === 0 })}>
                  <span>
                    {t.rule} · alert {alertTypes.join(", ")}
                  </span>
                  <span className="flex flex-col text-fg-muted tabular-nums">
                    {t.params.map(([k, v]) => (
                      <span key={k}>
                        {k} {v}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className="text-[13px] text-fg-muted">
          The latest run raised no alert on this transaction.
        </span>
      )}
    </Card>
  );
}
