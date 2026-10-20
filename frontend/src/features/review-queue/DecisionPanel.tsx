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
    placeholder: "In Czech, it goes into the FAÚ report: what is suspicious and why",
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

const logEntry = cva("flex flex-col gap-1 rounded-md border border-border px-3 py-2.5", {
  variants: {
    action: {
      ASSIGNED: "",
      REASSIGNED: "",
      NEW: "",
      ESCALATED: "",
      FALSE_POSITIVE: "bg-low-bg",
      REPORTED: "bg-high-bg",
    },
  },
});

/** The case's decision log, newest first; a step without an actor is the engine's own routing. */
function DecisionLog({ log, onFauReport }: { log: CaseEvent[]; onFauReport?: () => void }) {
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
          {e.postponed && (
            <span className="text-xs font-semibold">Client's order postponed (§20)</span>
          )}
          {e.action === "REPORTED" && onFauReport && (
            <button
              type="button"
              onClick={onFauReport}
              className="mt-1 h-7 cursor-pointer self-start rounded-md border-0 bg-fg px-3 text-xs font-semibold text-bg hover:opacity-90"
            >
              FAÚ report (PDF)
            </button>
          )}
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
  /** Saves to the engine first; a rejection is shown in the panel and nothing is recorded. `postponed` comes with a report only. */
  onDecide: (action: Decision["action"], reason: string, postponed?: boolean) => Promise<void>;
  /** Opens the FAÚ report of a reported case. */
  onFauReport: () => void;
};

/** What the user sees in place of the choices: the case is closed, or it is not theirs to decide. */
function notice(saved: CaseStatus, role: Role) {
  if (saved === "False Positive" || saved === "Reported")
    return (
      <>
        Resolved as <b className="text-fg">{saved}</b>.
      </>
    );
  if (role === "COMPLIANCE_MANAGER")
    return (
      <>
        <b className="text-fg">{saved}</b>. The analyst and the compliance officer decide; you
        oversee.
      </>
    );
  if (saved === "Escalated" && role === "ANALYST")
    return (
      <>
        <b className="text-fg">Escalated</b>. The compliance officer decides now: false positive or
        report.
      </>
    );
  return null;
}

/**
 * An analyst marks a case false positive or escalates it to the compliance officer; the compliance officer marks it
 * false positive or reports it, escalated or new. An analyst only sees that an escalated case waits; the compliance
 * manager oversees and decides nothing. Only the compliance officer and the compliance manager open the FAÚ report.
 * Every choice needs a reason. Below, the decision log: who routed, decided or reassigned what and why.
 */
export function DecisionPanel({ log, saved, role, onDecide, onFauReport }: DecisionPanelProps) {
  const choices: Choice[] =
    role === "COMPLIANCE_OFFICER" ? ["falsePositive", "report"] : ["falsePositive", "escalate"];
  const fauReport = role === "ANALYST" ? undefined : onFauReport;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reasons, setReasons] = useState<Record<Choice, string>>({
    falsePositive: "",
    escalate: "",
    report: "",
  });
  const reason = choice ? reasons[choice].trim() : "";
  // A report must say whether the client's order is held under §20; no default, the compliance officer picks one.
  const [postponed, setPostponed] = useState<boolean | null>(null);
  const ready = reason !== "" && (choice !== "report" || postponed !== null);
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

  const status = notice(saved, role);
  if (status) {
    return (
      <Card raised className="overflow-hidden pb-3.5">
        <span className="pt-0.5 text-sm font-bold text-fg">Decision</span>
        <span className="text-[13px] text-fg-muted">{status}</span>
        <DecisionLog log={log} onFauReport={fauReport} />
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
          {choice === "report" && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-xs font-semibold">
                Client's order (§20 AML Act){" "}
                <span className="font-normal text-fg-subtle">required</span>
              </legend>
              {(
                [
                  [false, "Execute it"],
                  [true, "Postpone: execute no earlier than 24 h after FAÚ receives the report"],
                ] as const
              ).map(([value, label]) => (
                <label key={label} className="flex items-start gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="postponed"
                    checked={postponed === value}
                    onChange={() => setPostponed(value)}
                    className="mt-0.5 accent-purple"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            disabled={!ready || saving}
            onClick={() =>
              save(() =>
                choice === "report"
                  ? onDecide(copy[choice].action, reason, postponed ?? undefined)
                  : onDecide(copy[choice].action, reason),
              )
            }
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
