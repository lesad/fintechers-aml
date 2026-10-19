import { cva } from "class-variance-authority";
import { useState } from "react";

import { Card, type CaseStatus } from "@/components";

import { formatTs } from "./queue";

import type { CaseEvent } from "./api";
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
    busy: "Checking for a rule change…",
  },
  escalate: {
    button: "Escalate",
    action: "Escalated",
    label: "Reason for escalating",
    placeholder: "What needs further investigation and why",
    submit: "Escalate transaction",
    busy: "Escalating…",
  },
  report: {
    button: "Report",
    action: "Reported",
    label: "Reason for reporting",
    placeholder: "Why the transaction is reported as suspicious",
    submit: "Report transaction",
    busy: "Reporting…",
  },
} as const;

const ACTION_LABEL: Record<CaseEvent["action"], string> = {
  ASSIGNED: "Assigned",
  REASSIGNED: "Reassigned",
  NEW: "Reopened",
  ESCALATED: "Escalated",
  FALSE_POSITIVE: "False positive",
  REPORTED: "Reported",
};

const logEntry = cva("flex flex-col gap-1 rounded-md border px-3 py-2.5", {
  variants: {
    action: {
      ASSIGNED: "border-indigo",
      REASSIGNED: "border-indigo",
      NEW: "border-indigo",
      ESCALATED: "border-indigo",
      FALSE_POSITIVE: "border-low-bg bg-low-bg",
      REPORTED: "border-high-bg bg-high-bg",
    },
  },
});

/** The case's decision log, newest first; a step without an actor is the engine's own routing. */
function DecisionLog({ log }: { log: CaseEvent[] }) {
  if (log.length === 0) return null;
  return (
    <ol aria-label="Decision log" className="flex flex-col gap-1.5">
      {log.map((e) => (
        <li key={`${e.at}-${e.action}`} className={logEntry({ action: e.action })}>
          <span className="text-[13px] font-bold">
            {ACTION_LABEL[e.action]}
            {e.assignee && <span className="font-normal text-fg-muted"> → {e.assignee}</span>}
          </span>
          <span className="text-xs text-fg-muted">
            {e.actor ?? "Triage"} · {formatTs(e.at)}
          </span>
          {e.reason && <span className="text-[13px] text-pretty">{e.reason}</span>}
        </li>
      ))}
    </ol>
  );
}

type DecisionPanelProps = {
  log: CaseEvent[];
  /** The case status the engine holds; an escalated case moves on to false positive or report. */
  saved: CaseStatus;
  role: Role;
  /** Saves to the engine first; a rejection is shown in the panel and nothing is recorded. */
  onDecide: (action: Decision["action"], reason: string) => Promise<void>;
};

/**
 * New cases: false positive or escalate. Escalated cases belong to the manager (false positive or report);
 * a reviewer only sees that they wait. Every choice needs a reason. Below, the decision log: who routed, decided
 * or reassigned what and why.
 */
export function DecisionPanel({ log, saved, role, onDecide }: DecisionPanelProps) {
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
      .then(() => setChoice(null))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  };

  const errorLine = error && (
    <span role="alert" className="text-xs text-high">
      {error}
    </span>
  );

  if (saved === "Escalated" && role !== "Manager") {
    return (
      <Card raised className="overflow-hidden pb-3.5">
        <span className="pt-0.5 text-sm font-bold text-fg">Decision</span>
        <span className="text-[13px] text-fg-muted">
          <b className="text-fg">Escalated</b>. A manager decides now: false positive or report.
        </span>
        <DecisionLog log={log} />
      </Card>
    );
  }

  if (saved === "False Positive" || saved === "Reported") {
    return (
      <Card raised className="overflow-hidden pb-3.5">
        <span className="pt-0.5 text-sm font-bold text-fg">Decision</span>
        <span className="text-[13px] text-fg-muted">
          Resolved as <b className="text-fg">{saved}</b>.
        </span>
        <DecisionLog log={log} />
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
            className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border-0 bg-fg text-[13px] font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && (
              <span
                aria-hidden="true"
                className="size-3.5 animate-spin rounded-full border-2 border-bg/40 border-t-bg"
              />
            )}
            {saving ? copy[choice].busy : copy[choice].submit}
          </button>
          {errorLine}
        </>
      ) : (
        <span className="text-xs text-fg-subtle">Reason is required after decision.</span>
      )}
      <DecisionLog log={log} />
    </Card>
  );
}
