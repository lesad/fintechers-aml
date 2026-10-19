import { cva } from "class-variance-authority";
import { useState } from "react";

import { Card, type CaseStatus } from "@/components";

import type { Decision } from "./decisions";
import type { Role } from "./queue";

type Choice = "falsePositive" | "escalate" | "report";

const choiceButton = cva(
  "h-8 cursor-pointer rounded-md border text-[13px] disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      kind: {
        falsePositive: "border-border bg-transparent font-semibold text-fg enabled:hover:border-fg",
        escalate: "border-fg bg-fg font-bold text-bg enabled:hover:opacity-90",
        report: "border-fg bg-fg font-bold text-bg enabled:hover:opacity-90",
      },
      picked: { true: "ring-2 ring-yellow ring-offset-2 ring-offset-bg" },
    },
    compoundVariants: [{ kind: "falsePositive", picked: true, className: "border-fg" }],
  },
);

const copy = {
  falsePositive: {
    button: "False positive",
    action: "False Positive",
    label: "Why it is a false positive",
    placeholder: "Why the transaction is not suspicious",
    submit: "Mark as false positive",
  },
  escalate: {
    button: "Escalate",
    action: "Escalated",
    label: "Reason for escalating",
    placeholder: "What needs further investigation and why",
    submit: "Escalate transaction",
  },
  report: {
    button: "Report",
    action: "Reported",
    label: "Reason for reporting",
    placeholder: "Why the transaction is reported as suspicious",
    submit: "Report transaction",
  },
} as const;

type DecisionPanelProps = {
  decision: Decision | undefined;
  /** The case status the engine holds; an escalated case moves on to false positive or report. */
  saved: CaseStatus;
  role: Role;
  /** Saves to the engine first; a rejection is shown in the panel and nothing is recorded. */
  onDecide: (action: Decision["action"], reason: string) => Promise<void>;
};

/**
 * New cases: false positive or escalate. Escalated cases: false positive or report, and only a manager
 * reports. Every choice needs a reason; once decided, shows who decided what and why.
 */
export function DecisionPanel({ decision, saved, role, onDecide }: DecisionPanelProps) {
  const choices: Choice[] =
    saved === "Escalated" ? ["falsePositive", "report"] : ["falsePositive", "escalate"];
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reasons, setReasons] = useState<Record<Choice, string>>({
    falsePositive: "",
    escalate: "",
    report: "",
  });
  const reason = choice ? reasons[choice].trim() : "";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = (call: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    call()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  };
  const managerOnly = (kind: Choice) => kind === "report" && role !== "Manager";

  const errorLine = error && (
    <span role="alert" className="text-xs text-high">
      {error}
    </span>
  );

  if (decision) {
    return (
      <Card raised className="overflow-hidden pb-3.5">
        <span className="pt-0.5 text-sm font-bold text-fg">Decision</span>
        <div className="flex flex-col gap-1.5 rounded-md bg-sel px-3 py-2.5">
          <span className="text-[13px] font-bold">{decision.action}</span>
          <span className="text-xs text-fg-muted">
            {decision.by} · {decision.at}
          </span>
          <span className="text-[13px] text-pretty">{decision.reason}</span>
        </div>
      </Card>
    );
  }

  if (saved === "False Positive" || saved === "Reported") {
    return (
      <Card raised className="overflow-hidden pb-3.5">
        <span className="pt-0.5 text-sm font-bold text-fg">Decision</span>
        <span className="text-[13px] text-fg-muted">
          Resolved as <b className="text-fg">{saved}</b>. The reason is not stored yet.
        </span>
      </Card>
    );
  }

  return (
    <Card raised className="overflow-hidden pb-3.5">
      <span className="pt-0.5 text-sm font-bold text-fg">Decision</span>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={choice === kind}
            disabled={managerOnly(kind)}
            title={managerOnly(kind) ? "Only a manager can report a transaction" : undefined}
            onClick={() => setChoice(kind)}
            className={choiceButton({ kind, picked: choice === kind })}
          >
            {copy[kind].button}
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
            disabled={!reason || saving}
            onClick={() => save(() => onDecide(copy[choice].action, reason))}
            className="h-8 cursor-pointer rounded-md border-0 bg-fg text-[13px] font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copy[choice].submit}
          </button>
          {errorLine}
        </>
      ) : (
        <span className="text-xs text-fg-subtle">Reason is required after decision.</span>
      )}
    </Card>
  );
}
