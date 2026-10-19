import { cva } from "class-variance-authority";

import { cn } from "@/utils";

import type { ReactNode } from "react";

export type RiskLevel = "High" | "Medium" | "Low";
/** The AI assessment: a level once done, its pending/failed state, or `none` when no model rates. */
export type AiRating = RiskLevel | "running" | "failed" | "none";

/** The small square/round marker in a risk colour (badges, tabs). */
export const riskDot = cva("", {
  variants: {
    level: { High: "bg-high-dot", Medium: "bg-med-dot", Low: "bg-low-dot" },
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

/** A risk level as a coloured badge: rule rating, client AML risk score. */
export function RiskBadge({ level, attached }: { level: RiskLevel; attached?: boolean }) {
  return (
    <span className={riskBadge({ level, attached })}>
      <span className={cn("size-[7px] rounded-[2px]", riskDot({ level }))} />
      {level}
    </span>
  );
}

/** The purple "AI" tag in front of an AI section's title. */
export function AiLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="rounded-full bg-purple px-1.5 text-[10px] leading-[18px] font-bold tracking-[0.06em] text-white">
        AI
      </span>
      <span className="text-xs font-semibold text-ai-fg">{children}</span>
    </span>
  );
}

const AI_STATE = { running: "running", failed: "failed", none: "not connected" } as const;

/** Rule rating with an "AI" tag once the AI has rated; the rule rating alone otherwise. */
export function RatingBadge({ rule, ai }: { rule: RiskLevel; ai: AiRating }) {
  if (ai === "running" || ai === "failed" || ai === "none") {
    return (
      <span title={`Rule rating ${rule} · AI assessment ${AI_STATE[ai]}`}>
        <RiskBadge level={rule} />
      </span>
    );
  }
  return (
    <span
      title={`Rule rating ${rule} · AI rating ${ai} (${ai === rule ? "matches" : "differs"})`}
      className="inline-flex h-5 flex-none items-stretch overflow-hidden rounded text-xs leading-none"
    >
      <RiskBadge level={rule} attached />
      <span className="flex items-center bg-purple px-[5px] text-[10px] font-bold tracking-[0.06em] text-white">
        AI
      </span>
    </span>
  );
}
