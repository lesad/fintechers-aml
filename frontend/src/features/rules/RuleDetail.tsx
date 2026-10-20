import { cva } from "class-variance-authority";
import { useState } from "react";

import { ConditionCode, ConditionLegend } from "@/components";

import { changeRuleStatus, deleteRule, type RuleVersion } from "./api";
import { grainLabel, paramParts, paramText, scopeLabel, shortDate, windowShort } from "./format";

import type { ReactNode } from "react";

type RuleDetailProps = {
  version: RuleVersion;
  /** All versions of the same key, newest first. */
  siblings: RuleVersion[];
  onSelectVersion: (id: number) => void;
  onNewVersion: () => void;
  onEditDraft: () => void;
  /** Only a manager approves or rejects a pending version. */
  manager: boolean;
  onStatusChanged: (changed: RuleVersion) => void;
  onDeleted: (deleted: RuleVersion) => void;
};

const dot = cva("inline-block size-1.5 flex-none rounded-full", {
  variants: {
    status: {
      active: "bg-low-dot",
      draft: "bg-draft-dot",
      pending: "bg-indigo",
      approved: "bg-indigo-60",
      retired: "bg-retired-dot",
    },
  },
});

const tab = cva(
  "flex h-[22px] items-center gap-1.5 rounded px-2 text-xs font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-yellow",
  {
    variants: {
      selected: {
        true: "bg-bg shadow-[0_1px_2px_rgba(37,39,70,.12),0_0_0_1px_var(--color-border)]",
        false: "bg-transparent",
      },
    },
  },
);

const h2 = "text-[13px] font-semibold";
const primary =
  "h-7 rounded bg-indigo px-3 text-[13px] font-semibold text-white hover:bg-indigo-hover disabled:cursor-not-allowed disabled:bg-retired-dot";
const secondary =
  "h-7 rounded border border-indigo bg-bg px-3 text-[13px] font-semibold text-indigo hover:bg-indigo hover:text-white disabled:cursor-not-allowed";
const danger =
  "h-7 rounded border border-high bg-bg px-3 text-[13px] font-semibold text-high hover:bg-high hover:text-white disabled:cursor-not-allowed";

const byline = (v: RuleVersion) => {
  const by = v.author ?? "unknown";
  if (v.status === "draft") return `Drafted by ${by}, ${shortDate(v.createdAt)}`;
  if (v.status === "pending") return `Drafted by ${by}, ${shortDate(v.createdAt)}`;
  if (v.status === "active" && v.approver && v.approvedAt)
    return `Active since ${shortDate(v.approvedAt)} · by ${by} · approved by ${v.approver}`;
  if (v.status === "active") return `Active since ${shortDate(v.createdAt)} · by ${by}`;
  return `Created ${shortDate(v.createdAt)} · by ${by}`;
};

export function RuleDetail(props: RuleDetailProps) {
  const { version: v, siblings } = props;
  const active = siblings.find((s) => s.status === "active");
  return (
    <section
      aria-label={`${v.key} v${v.version}`}
      className="flex max-w-[1040px] flex-col gap-4 px-6 pt-4 pb-8"
    >
      <Header {...props} />
      {(v.status === "draft" || v.status === "pending") && <DraftNote draft={v} active={active} />}
      {v.status === "retired" && (
        <div className="rounded-md border border-border bg-bg-sub px-3 py-2 text-fg-muted">
          Retired. Kept for audit of cases flagged while it was active.
        </div>
      )}
      <section className="flex flex-col gap-1 rounded-md bg-ai-bg px-4 py-3">
        <div className="text-[11px] font-bold tracking-[0.06em] text-ai-fg uppercase">
          What it flags
        </div>
        {v.explanation ? (
          <p className="text-sm leading-normal text-pretty">{v.explanation}</p>
        ) : (
          <p className="text-sm leading-normal text-fg-subtle italic">No explanation yet</p>
        )}
      </section>
      <Condition version={v} />
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
        <Parameters version={v} />
        <Variables version={v} />
      </section>
    </section>
  );
}

function Header({
  version: v,
  siblings,
  onSelectVersion,
  onNewVersion,
  onEditDraft,
  manager,
  onStatusChanged,
  onDeleted,
}: RuleDetailProps) {
  const name = siblings[0]?.name ?? v.name;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-fg-subtle">
        Alert type {v.alertType} · {scopeLabel(v)} · {grainLabel[v.grain]}
        {v.replacesKey && ` · replaces ${v.replacesKey}`}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[260px] flex-1 flex-wrap items-baseline gap-2.5">
          <span className="font-mono text-lg font-bold">{v.key}</span>
          {name && <h1 className="text-lg leading-tight font-semibold text-pretty">{name}</h1>}
        </div>
        {v.status === "draft" && (
          <button type="button" onClick={onEditDraft} className={primary}>
            Edit draft v{v.version}
          </button>
        )}
        <StatusActions
          key={v.id}
          version={v}
          manager={manager}
          onStatusChanged={onStatusChanged}
          onDeleted={onDeleted}
        />
        {/* A draft or pending version is still being decided: edit it instead of stacking a new version on it. */}
        {(v.status === "active" || v.status === "retired") && (
          <button type="button" onClick={onNewVersion} className={secondary}>
            New version from v{v.version}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Versions"
          className="flex gap-0.5 rounded-md border border-border bg-bg-sub p-0.5"
        >
          {siblings.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === v.id}
              onClick={() => onSelectVersion(s.id)}
              className={tab({ selected: s.id === v.id })}
            >
              <span>v{s.version}</span>
              <span aria-hidden="true" className={dot({ status: s.status })} />
              <span className="font-normal text-fg-muted">{s.status}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-subtle">{byline(v)}</span>
      </div>
    </div>
  );
}

type StatusActionsProps = Pick<
  RuleDetailProps,
  "version" | "manager" | "onStatusChanged" | "onDeleted"
>;

function StatusActions({ version: v, manager, onStatusChanged, onDeleted }: StatusActionsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteRule(v.id);
      onDeleted(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const run = async (action: Parameters<typeof changeRuleStatus>[1]) => {
    setBusy(true);
    setError(null);
    try {
      onStatusChanged(await changeRuleStatus(v.id, action));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const failure = error && (
    <span role="alert" className="text-xs text-high">
      {error}
    </span>
  );
  if (v.status === "draft" && confirming) {
    return (
      <>
        {failure}
        <span className="text-[13px] text-fg-muted">Delete draft v{v.version}?</span>
        <button type="button" disabled={busy} onClick={remove} className={danger}>
          Delete
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className={secondary}
        >
          Keep
        </button>
      </>
    );
  }
  if (v.status === "draft") {
    return (
      <>
        {failure}
        <button type="button" disabled={busy} onClick={() => run("submit")} className={secondary}>
          Send for approval
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
          className={danger}
        >
          Delete draft
        </button>
      </>
    );
  }
  if (v.status !== "pending" || !manager) return null;
  return (
    <>
      {failure}
      <button type="button" disabled={busy} onClick={() => run("reject")} className={secondary}>
        Reject
      </button>
      <button type="button" disabled={busy} onClick={() => run("approve")} className={primary}>
        Approve v{v.version}
      </button>
    </>
  );
}

function DraftNote({ draft, active }: { draft: RuleVersion; active: RuleVersion | undefined }) {
  const changes = active
    ? Object.entries(draft.params).flatMap(([name, param]) => {
        const before = active.params[name];
        return before && before.value !== param.value
          ? [{ name, from: paramText(before), to: paramText(param) }]
          : [];
      })
    : [];
  return (
    <div className="flex flex-col gap-1 rounded-md border border-draft-line bg-sel px-3 py-2.5">
      <div className="font-semibold">
        {draft.status === "pending"
          ? `Waiting for approval by ${draft.assignee ?? "a manager"} — not evaluating transactions yet`
          : "Draft — not evaluating transactions yet"}
      </div>
      {active && changes.length > 0 && (
        <>
          <div className="text-fg-muted">Compared with v{active.version} active:</div>
          {changes.map((c) => (
            <div key={c.name} className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span>{c.name}</span>
              <span className="rounded-[3px] bg-high-bg px-1.5 py-px text-high line-through">
                {c.from}
              </span>
              <span className="text-fg-subtle">→</span>
              <span className="rounded-[3px] bg-low-bg px-1.5 py-px font-bold text-low">
                {c.to}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Condition({ version: v }: { version: RuleVersion }) {
  const variables = new Set(v.variables.map((x) => x.name));
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className={h2}>Condition</h2>
      {v.anchor && (
        <div className="flex flex-wrap items-center gap-2 text-fg-muted">
          Evaluated at each transaction where
          <code className="rounded-[3px] border border-border-soft bg-bg-sub px-1.5 py-0.5 font-mono text-xs text-fg">
            {v.anchor}
          </code>
        </div>
      )}
      <ConditionCode condition={v.condition} variables={variables} />
      <ConditionLegend />
    </section>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border-soft overflow-hidden rounded-md border border-border">
      {children}
    </div>
  );
}

function Parameters({ version: v }: { version: RuleVersion }) {
  const params = Object.entries(v.params);
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className={h2}>Parameters</h2>
      {params.length ? (
        <Rows>
          {params.map(([name, param]) => {
            const { value, unit } = paramParts(param);
            return (
              <div key={name} className="flex items-center justify-between gap-3 px-3 py-[7px]">
                <span className="rounded-[3px] bg-yellow px-1.5 py-px font-mono text-[13px] font-bold text-indigo">
                  {name}
                </span>
                <span className="text-right font-mono text-[13px] font-bold">
                  {value}
                  {unit && <span className="text-xs font-normal text-fg-subtle"> {unit}</span>}
                </span>
              </div>
            );
          })}
        </Rows>
      ) : (
        <None />
      )}
    </div>
  );
}

function Variables({ version: v }: { version: RuleVersion }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className={h2}>Variables</h2>
      {v.variables.length ? (
        <Rows>
          {v.variables.map((x) => (
            <div key={x.name} className="flex flex-col gap-0.5 px-3 py-[7px]">
              <span className="font-mono text-[13px] font-bold text-ai-fg">{x.name}</span>
              <span className="font-mono text-xs">
                {x.agg} of {x.field} where {x.filter}
              </span>
              <span className="text-xs text-fg-muted">
                window: <span className="font-mono">{windowShort(x.window)}</span>
              </span>
            </div>
          ))}
        </Rows>
      ) : (
        <None />
      )}
    </div>
  );
}

function None() {
  return (
    <div className="rounded-md border border-dashed border-border px-3.5 py-3 text-fg-subtle">
      None
    </div>
  );
}
