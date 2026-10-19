import { cn } from "@/utils";

export type RiskLevel = "High" | "Medium" | "Low";
/** The AI assessment: a level once done, or its pending/failed state. */
export type AiRating = RiskLevel | "running" | "failed";

export const riskClasses: Record<RiskLevel, { text: string; bg: string; dot: string }> = {
  High: { text: "text-high", bg: "bg-high-bg", dot: "bg-high-dot" },
  Medium: { text: "text-med", bg: "bg-med-bg", dot: "bg-med-dot" },
  Low: { text: "text-low", bg: "bg-low-bg", dot: "bg-low-dot" },
};

const pill = "inline-flex h-5 flex-none items-stretch overflow-hidden text-xs leading-none";
const aiMark = "flex items-center px-1.5 text-[10px] font-bold tracking-[0.06em]";

function RuleSegment({ level }: { level: RiskLevel }) {
  const c = riskClasses[level];
  return (
    <span className={cn("flex items-center gap-[5px] px-[7px] font-bold", c.bg, c.text)}>
      <span className={cn("size-[7px] rounded-[2px]", c.dot)} />
      {level}
    </span>
  );
}

/**
 * Rule rating with the AI rating attached: one joined badge when AI agrees or failed,
 * a separate AI pill when it disagrees or is still running.
 */
export function RatingBadge({ rule, ai }: { rule: RiskLevel; ai: AiRating }) {
  if (ai === rule) {
    return (
      <span
        title={`Rule rating ${rule} · AI rating matched (${rule})`}
        className={cn(pill, "rounded")}
      >
        <RuleSegment level={rule} />
        <span className={cn(aiMark, "bg-purple text-white")}>AI</span>
      </span>
    );
  }
  if (ai === "failed") {
    return (
      <span title="AI assessment failed · rule rating only" className={cn(pill, "rounded")}>
        <RuleSegment level={rule} />
        <span className={cn(aiMark, "bg-border text-fg-subtle line-through")}>AI</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span title="Rule rating" className={cn(pill, "rounded")}>
        <RuleSegment level={rule} />
      </span>
      <span
        title={
          ai === "running"
            ? "AI assessment is still running"
            : `AI rating ${ai} differs from rule rating ${rule}`
        }
        className={cn(pill, "rounded-full border border-ai-line")}
      >
        <span className={cn(aiMark, "bg-purple text-white")}>AI</span>
        {ai === "running" ? (
          <span className="flex items-center gap-[5px] bg-bg pr-2 pl-1.5 text-fg-subtle italic">
            <span className="size-1.5 rounded-full border-[1.5px] border-fg-subtle" />
            Running…
          </span>
        ) : (
          <span
            className={cn(
              "flex items-center gap-[5px] bg-bg pr-2 pl-1.5 font-semibold",
              riskClasses[ai].text,
            )}
          >
            <span className={cn("size-1.5 rounded-full", riskClasses[ai].dot)} />
            {ai}
          </span>
        )}
      </span>
    </span>
  );
}
