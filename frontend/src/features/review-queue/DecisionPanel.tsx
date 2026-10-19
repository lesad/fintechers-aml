import { cva } from "class-variance-authority";
import { useState } from "react";

import { Card } from "@/components";

import type { Decision } from "./decisions";

type Choice = "falsePositive" | "escalate";

const choiceButton = cva("h-8 cursor-pointer rounded-md border text-[13px]", {
  variants: {
    kind: {
      falsePositive: "border-border bg-transparent font-semibold text-fg hover:border-fg",
      escalate: "border-fg bg-fg font-bold text-bg hover:opacity-90",
    },
    picked: { true: "ring-2 ring-yellow ring-offset-2 ring-offset-bg" },
  },
  compoundVariants: [{ kind: "falsePositive", picked: true, className: "border-fg" }],
});

const copy = {
  falsePositive: {
    label: "Why it is a false positive",
    placeholder: "Why the transaction is not suspicious",
    submit: "Mark as false positive",
  },
  escalate: {
    label: "Reason for escalating",
    placeholder: "What needs further investigation and why",
    submit: "Escalate transaction",
  },
} as const;

type DecisionPanelProps = {
  decision: Decision | undefined;
  onDecide: (action: Decision["action"], reason: string) => void;
  onUndo: () => void;
};

/** False positive or escalate with a required reason; once decided, shows who decided what and why. */
export function DecisionPanel({ decision, onDecide, onUndo }: DecisionPanelProps) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reasons, setReasons] = useState<Record<Choice, string>>({
    falsePositive: "",
    escalate: "",
  });
  const reason = choice ? reasons[choice].trim() : "";

  return (
    <Card raised className="overflow-hidden pb-3.5">
      <span className="pt-0.5 text-sm font-bold text-fg">Decision</span>
      {decision ? (
        <>
          <div className="flex flex-col gap-1.5 rounded-md bg-sel px-3 py-2.5">
            <span className="text-[13px] font-bold">{decision.action}</span>
            <span className="text-xs text-fg-muted">
              {decision.by} · {decision.at}
            </span>
            <span className="text-[13px] text-pretty">{decision.reason}</span>
          </div>
          <button
            type="button"
            onClick={onUndo}
            className="cursor-pointer self-start border-0 bg-transparent p-0 text-xs text-fg-muted underline hover:text-purple"
          >
            Undo decision
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["falsePositive", "escalate"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={choice === kind}
                onClick={() => setChoice(kind)}
                className={choiceButton({ kind, picked: choice === kind })}
              >
                {kind === "falsePositive" ? "False positive" : "Escalate"}
              </button>
            ))}
          </div>
          {choice ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold">
                  {copy[choice].label} <span className="font-normal text-fg-subtle">required</span>
                </span>
                <textarea
                  rows={4}
                  value={reasons[choice]}
                  placeholder={copy[choice].placeholder}
                  onChange={(e) => setReasons({ ...reasons, [choice]: e.target.value })}
                  className="min-h-[76px] resize-y rounded border border-border bg-bg px-2.5 py-2 text-[13px] leading-[1.45] text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25"
                />
              </label>
              <button
                type="button"
                disabled={!reason}
                onClick={() =>
                  onDecide(choice === "falsePositive" ? "False Positive" : "Escalated", reason)
                }
                className="h-8 cursor-pointer rounded-md border-0 bg-fg text-[13px] font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copy[choice].submit}
              </button>
            </>
          ) : (
            <span className="text-xs text-fg-subtle">Reason is required after decision.</span>
          )}
        </>
      )}
    </Card>
  );
}
