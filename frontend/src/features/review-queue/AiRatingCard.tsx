import { RiskBadge, type RiskLevel } from "@/components";

import { ASK_WHO_LABEL, ASSESSMENT, VERDICT_LABEL } from "./ai";
import { AiResultCard, Refs } from "./AiResultCard";
import { useAiResult } from "./use-ai-result";

const LEVEL = { high: "High", medium: "Medium", low: "Low" } as const;
const ORDER = { High: 3, Medium: 2, Low: 1 } as const;

const section = "text-[11px] font-semibold text-ai-fg";
const item = "m-0 text-[13px] leading-normal text-pretty text-fg";
const detail = "block text-xs text-fg-muted";

/** The model's advice on the alert: a rating next to the rule rating, a verdict, a summary and open points. Triage never reads it (ADR-0043). */
export function AiRatingCard({
  alertId,
  ruleRating,
}: {
  alertId: number;
  ruleRating: RiskLevel | null;
}) {
  const { state, run } = useAiResult(alertId, ASSESSMENT);
  return (
    <AiResultCard
      title="Rating"
      state={state}
      onRun={run}
      copy={{
        running: "Assessment in progress…",
        failed:
          "The AI assessment could not be completed for this transaction. Review it based on the rule rating.",
      }}
    >
      {({ body }) => {
        const level = LEVEL[body.rating];
        const differs = ruleRating !== null && ruleRating !== level;
        return (
          <>
            <div className="flex items-center gap-2">
              <RiskBadge level={level} />
              <span className="text-[13px] text-fg-muted">{VERDICT_LABEL[body.verdict]}</span>
              {differs && (
                <span className="rounded-[3px] bg-fg px-[5px] text-[11px] leading-4 font-semibold text-bg">
                  ≠ {ORDER[level] > ORDER[ruleRating] ? "higher" : "lower"} than rule
                </span>
              )}
            </div>
            <p className={item}>
              {body.summary.map((s) => (
                <span key={s.text} className="mr-1">
                  {s.text}
                  <Refs refs={s.refs} />
                </span>
              ))}
            </p>
            <span className={section}>Open points</span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {body.openPoints.map((p) => (
                <li key={p.question.text} className={item}>
                  <span className="font-semibold">{p.question.text}</span>
                  <Refs refs={p.question.refs} />
                  <span className={detail}>Suspicious: {p.suspicious}</span>
                  <span className={detail}>Normal: {p.normal}</span>
                  <span className={detail}>Would settle: {p.wouldSettle}</span>
                  <span className={detail}>Ask: {ASK_WHO_LABEL[p.askWho]}</span>
                </li>
              ))}
            </ul>
          </>
        );
      }}
    </AiResultCard>
  );
}
