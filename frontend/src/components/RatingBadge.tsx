import { cva } from "class-variance-authority";

import { cn } from "@/utils";

export type RiskLevel = "High" | "Medium" | "Low";
/** The AI assessment: a level once done, or its pending/failed state. */
export type AiRating = RiskLevel | "running" | "failed";

/** The small square/round marker in a risk colour (badges, tabs). */
export const riskDot = cva("", {
  variants: {
    level: { High: "bg-high-dot", Medium: "bg-med-dot", Low: "bg-low-dot" },
  },
});

/** Text in a risk colour. */
export const riskText = cva("", {
  variants: {
    level: { High: "text-high", Medium: "text-med", Low: "text-low" },
  },
});

const riskBadge = cva(
  "inline-flex flex-none items-center gap-[5px] px-[7px] text-xs leading-none font-bold",
  {
    variants: {
      level: {
        High: "bg-high-bg text-high",
        Medium: "bg-med-bg text-med",
        Low: "bg-low-bg text-low",
      },
      /** Joined into a wider pill: fills its height, no own corners. */
      attached: { true: "h-full", false: "h-5 rounded" },
    },
    defaultVariants: { attached: false },
  },
);

const pill = cva("inline-flex h-5 flex-none items-stretch overflow-hidden text-xs leading-none", {
  variants: {
    shape: {
      joined: "rounded",
      ai: "rounded-full border border-ai-line",
      failed: "rounded-full border border-border",
    },
  },
});

const aiMark = cva("flex items-center px-1.5 text-[10px] font-bold tracking-[0.06em]", {
  variants: {
    state: {
      on: "bg-purple text-white",
      off: "bg-border text-fg-subtle",
      struck: "bg-border text-fg-subtle line-through",
    },
  },
});

/** A risk level as a coloured badge: rule rating, client AML risk score. */
export function RiskBadge({ level, attached }: { level: RiskLevel; attached?: boolean }) {
  return (
    <span className={riskBadge({ level, attached })}>
      <span className={cn("size-[7px] rounded-[2px]", riskDot({ level }))} />
      {level}
    </span>
  );
}

/** The AI rating on its own, in a rounded pill marked "AI". */
export function AiPill({ rating }: { rating: AiRating }) {
  if (rating === "failed") {
    return (
      <span className={pill({ shape: "failed" })}>
        <span className={aiMark({ state: "off" })}>AI</span>
        <span className="flex items-center bg-bg pr-2 pl-1.5 font-semibold text-fg-subtle">
          Failed
        </span>
      </span>
    );
  }
  return (
    <span className={pill({ shape: "ai" })}>
      <span className={aiMark({ state: "on" })}>AI</span>
      {rating === "running" ? (
        <span className="flex items-center gap-[5px] bg-bg pr-2 pl-1.5 text-fg-subtle italic">
          <span className="size-1.5 rounded-full border-[1.5px] border-fg-subtle" />
          Running…
        </span>
      ) : (
        <span
          className={cn(
            "flex items-center gap-[5px] bg-bg pr-2 pl-1.5 font-semibold",
            riskText({ level: rating }),
          )}
        >
          <span className={cn("size-1.5 rounded-full", riskDot({ level: rating }))} />
          {rating}
        </span>
      )}
    </span>
  );
}

/**
 * Rule rating with the AI rating attached: one joined badge when AI agrees or failed,
 * a separate AI pill when it disagrees or is still running.
 */
export function RatingBadge({ rule, ai }: { rule: RiskLevel; ai: AiRating }) {
  if (ai === rule || ai === "failed") {
    return (
      <span
        title={
          ai === "failed"
            ? "AI assessment failed · rule rating only"
            : `Rule rating ${rule} · AI rating matched (${rule})`
        }
        className={pill({ shape: "joined" })}
      >
        <RiskBadge level={rule} attached />
        <span className={aiMark({ state: ai === "failed" ? "struck" : "on" })}>AI</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span title="Rule rating">
        <RiskBadge level={rule} />
      </span>
      <span
        title={
          ai === "running"
            ? "AI assessment is still running"
            : `AI rating ${ai} differs from rule rating ${rule}`
        }
      >
        <AiPill rating={ai} />
      </span>
    </span>
  );
}

const rank: Record<RiskLevel, number> = { High: 0, Medium: 1, Low: 2 };

/** "higher" / "lower" when a finished AI rating differs from the rule rating, else null. */
export function aiDisagreement(rule: RiskLevel, ai: AiRating): "higher" | "lower" | null {
  if (ai === "running" || ai === "failed" || ai === rule) return null;
  return rank[ai] < rank[rule] ? "higher" : "lower";
}
