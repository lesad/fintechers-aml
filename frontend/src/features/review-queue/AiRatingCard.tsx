import { useState } from "react";

import { AiPill, Modal, RiskBadge, type RiskLevel } from "@/components";
import { cn } from "@/utils";

import { ASK_WHO_LABEL, ASSESSMENT, type AssessmentBody, VERDICT_LABEL } from "./ai";
import { AiResultCard, Refs } from "./AiResultCard";
import { useAiResult } from "./use-ai-result";

const LEVEL = { high: "High", medium: "Medium", low: "Low" } as const;

const item = "m-0 text-[13px] leading-normal text-pretty text-fg";
/** An open point in the dialog, larger than the card's text. */
const point = "m-0 text-[15px] leading-normal text-pretty text-fg";
const detail = "mt-0.5 block text-sm text-fg-muted";
/** The point's next step, whom to ask, stands out from the reasoning above it. */
const ask = "mt-1.5 inline-block rounded bg-ai-bg px-2 py-0.5 text-sm font-semibold text-ai-fg";
const unverified = "underline decoration-med-dot decoration-dotted underline-offset-2";
const link =
  "cursor-pointer self-start border-0 bg-transparent p-0 text-xs font-semibold text-ai-fg hover:underline";

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
      aside={() => (
        <button
          type="button"
          className={cn(link, "ml-auto inline-flex items-center gap-1 self-center")}
          onClick={run}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3">
            <path
              d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Regenerate
        </button>
      )}
      copy={{
        running: "Assessment in progress (may take up to 20 seconds)…",
        failed:
          "The AI assessment could not be completed for this transaction. Review it based on the rule rating.",
      }}
    >
      {({ body }) => <Assessment body={body} ruleRating={ruleRating} />}
    </AiResultCard>
  );
}

function Assessment({ body, ruleRating }: { body: AssessmentBody; ruleRating: RiskLevel | null }) {
  const [open, setOpen] = useState(false);
  const level = LEVEL[body.rating];
  const refs = [...new Set(body.summary.flatMap((s) => s.refs))];
  const points = body.openPoints;
  /** Model text with each number the check could not match to the data marked, the reason as its tooltip. */
  const text = (at: string, value: string) => {
    const warning = body.warnings.find((w) => w.at === at);
    if (!warning) return value;
    const title = `Unverified: ${warning.message}`;
    const parts = splitOn(value, warning.numbers);
    // No flagged number found in the text: mark the whole field rather than lose the warning.
    if (parts.length === 1) {
      return (
        <span className={unverified} title={title}>
          {value}
        </span>
      );
    }
    // Each part is keyed by where it starts in the text, which is unique and stable for this text.
    const starts = parts.map((_, i) => parts.slice(0, i).join("").length);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <span key={starts[i]} className={unverified} title={title}>
          {part}
        </span>
      ) : (
        part
      ),
    );
  };
  return (
    <>
      <div className="flex items-center gap-2">
        <RiskBadge level={level} />
        <span className="text-[13px] text-fg-muted">{VERDICT_LABEL[body.verdict]}</span>
        {ruleRating !== null && ruleRating !== level && <AiPill rule={ruleRating} ai={level} />}
      </div>
      <p className={item}>
        {body.summary.map((s, i) => (
          <span key={s.text}>
            {i > 0 && " "}
            {text(`summary[${i}]`, s.text)}
          </span>
        ))}
        <Refs refs={refs} />
      </p>
      {body.warnings.length > 0 && (
        <span className="text-xs text-med">
          Dotted numbers are not in the data the model was given. Check them before relying on them.
        </span>
      )}
      {points.length > 0 && (
        <button type="button" className={link} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Show open points ({points.length})
        </button>
      )}
      {/* In a dialog, so the points do not stretch the card and the grid row it shares. */}
      {open && (
        <Modal
          label="Open points"
          onClose={() => setOpen(false)}
          className="max-w-[640px]"
          header={
            <h2 className="m-0 text-base font-bold">
              Open points <span className="font-normal text-fg-muted">({points.length})</span>
            </h2>
          }
        >
          <ul className="m-0 flex list-none flex-col gap-3 px-[18px] py-4">
            {points.map((p, i) => (
              <li key={p.question.text} className={point}>
                <span className="font-semibold">
                  {text(`openPoints[${i}].question`, p.question.text)}
                </span>
                <Refs refs={p.question.refs} />
                <span className={detail}>
                  Suspicious: {text(`openPoints[${i}].suspicious`, p.suspicious)}
                </span>
                <span className={detail}>Normal: {text(`openPoints[${i}].normal`, p.normal)}</span>
                <span className={detail}>
                  Would settle: {text(`openPoints[${i}].wouldSettle`, p.wouldSettle)}
                </span>
                <span className={ask}>Ask: {ASK_WHO_LABEL[p.askWho]}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

/** Splits [text] around whole occurrences of [numbers]; odd indexes are the matches. */
function splitOn(text: string, numbers: string[]): string[] {
  if (numbers.length === 0) return [text];
  const alternatives = numbers.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  // Same edges as the engine's number check: not part of a longer number on either side.
  return text.split(new RegExp(`(?<![\\d.,])(${alternatives})(?![\\d]|[.,]\\d)`));
}
