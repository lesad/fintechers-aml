import { cva } from "class-variance-authority";
import { useRef, useState } from "react";

import {
  APPROVER_ROLES,
  approvers,
  ConditionCode,
  ConditionLegend,
  Icon,
  Popover,
  SendForApproval,
  splitMain,
  splitMore,
  splitOption,
} from "@/components";

import { changeRuleStatus, type RuleVersion } from "./api";
import { grainLabel, paramParts, paramText, scopeLabel, shortDate, windowShort } from "./format";

import type { User } from "@/user";
import type { ReactNode } from "react";

type RuleDetailProps = {
  version: RuleVersion;
  /** All versions of the same key, newest first. */
  siblings: RuleVersion[];
  onSelectVersion: (id: number) => void;
  onNewVersion: () => void;
  onEditDraft: () => void;
  /** The signed-in user; null before one is picked. */
  user: User | null;
  /** Everyone an author can send a draft to, among others. */
  users: User[];
  /** [recalculating]: approved with "Approve and recalculate alerts", so the engine recalculates the alerts. */
  onStatusChanged: (changed: RuleVersion, recalculating?: boolean) => void;
  /** Draft only: delete it, or replay a period with it. */
  onDelete: () => void;
  onBacktest: () => void;
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
const secondary =
  "inline-flex h-7 items-center gap-1.5 rounded border border-indigo bg-bg px-3 text-[13px] font-semibold text-indigo hover:bg-indigo hover:text-white disabled:cursor-not-allowed";
const danger =
  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded border border-high-dot bg-bg px-3 text-[13px] font-semibold text-high hover:bg-high-bg";

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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
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
        {/* A first version changes nothing, so it has no reason to show. */}
        {v.version > 1 && (
          <section
            aria-label="Why this change"
            className="flex flex-col gap-1 rounded-md border border-border px-4 py-3"
          >
            <div className="text-[11px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
              Why this change
            </div>
            {v.changeReason ? (
              <p className="text-sm leading-normal whitespace-pre-line text-pretty">
                {v.changeReason}
              </p>
            ) : (
              <p className="text-sm leading-normal text-fg-subtle italic">
                Not recorded: saved before a reason was required
              </p>
            )}
          </section>
        )}
      </div>
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
  user,
  users,
  onStatusChanged,
  onDelete,
  onBacktest,
}: RuleDetailProps) {
  const name = siblings[0]?.name ?? v.name;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-fg-subtle">
        Alert type {v.alertType} · {scopeLabel(v)} · {grainLabel[v.grain]}
        {v.replacesKey && ` · replaces ${v.replacesKey}`}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[260px] flex-1 items-baseline gap-2.5">
          <span className="flex-none font-mono text-lg font-bold">{v.key}</span>
          {name && (
            <h1 title={name} className="min-w-0 truncate text-lg leading-tight font-semibold">
              {name}
            </h1>
          )}
        </div>
        {v.status === "draft" && (
          <>
            <button type="button" onClick={onDelete} className={danger}>
              <Icon name="trash" />
              Delete
            </button>
            <button type="button" onClick={onBacktest} className={secondary}>
              <Icon name="replay" />
              Backtest
            </button>
          </>
        )}
        {v.status === "draft" && (
          <button type="button" onClick={onEditDraft} className={secondary}>
            <Icon name="pencil" />
            Edit
          </button>
        )}
        <StatusActions
          key={v.id}
          version={v}
          user={user}
          users={users}
          onStatusChanged={onStatusChanged}
        />
        {/* A draft or pending version is still being decided: edit it instead of stacking a new version on it. */}
        {(v.status === "active" || v.status === "retired") && (
          <button type="button" onClick={onNewVersion} className={secondary}>
            <Icon name="plus" />
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

type StatusActionsProps = Pick<RuleDetailProps, "version" | "user" | "users" | "onStatusChanged">;

function StatusActions({ version: v, user, users, onStatusChanged }: StatusActionsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Four eyes: neither the author nor whoever sends it approves it.
  const { eligible, fallback } = approvers(users, v.author, user);
  const run = async (
    action: Parameters<typeof changeRuleStatus>[1],
    approverId?: number,
    recalculate = false,
  ) => {
    setBusy(true);
    setError(null);
    try {
      onStatusChanged(
        await changeRuleStatus(v.id, action, { approverId, recalculate }),
        recalculate,
      );
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
  if (v.status === "draft") {
    return (
      <>
        {failure}
        <SendForApproval
          fallback={fallback}
          eligible={eligible}
          busy={busy}
          onSend={(id) => run("submit", id)}
        />
      </>
    );
  }
  if (v.status !== "pending" || !user || !APPROVER_ROLES.has(user.role)) return null;
  if (v.author === user.name)
    return (
      <span className="text-xs text-fg-muted">
        You wrote this version; {v.assignee ?? "another approver"} decides it.
      </span>
    );
  if (user.role === "COMPLIANCE_MANAGER" && v.assignee !== user.name) return null;
  return (
    <>
      {failure}
      <button type="button" disabled={busy} onClick={() => run("reject")} className={secondary}>
        <Icon name="close" />
        Reject
      </button>
      <Approve busy={busy} onApprove={(recalculate) => run("approve", undefined, recalculate)} />
    </>
  );
}

/** Approve, or under the arrow approve and recalculate the alerts with the new version at once (ADR-0055). */
function Approve({
  busy,
  onApprove,
}: {
  busy: boolean;
  onApprove: (recalculate: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative inline-flex">
      <button type="button" disabled={busy} onClick={() => onApprove(false)} className={splitMain}>
        <Icon name="check" />
        Approve
      </button>
      <button
        ref={more}
        type="button"
        aria-label="More ways to approve"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(!open)}
        className={splitMore}
      >
        <Icon name="chevronDown" />
      </button>
      {open && (
        <Popover
          anchor={more}
          onClose={() => setOpen(false)}
          className="w-max min-w-56 gap-0 p-1.5"
        >
          <div role="menu" aria-label="Approve" className="flex flex-col">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onApprove(true);
              }}
              className={splitOption}
            >
              Approve and recalculate alerts
            </button>
          </div>
        </Popover>
      )}
    </div>
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
          ? `Waiting for approval by ${draft.assignee ?? "a compliance officer"} — not evaluating transactions yet`
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
