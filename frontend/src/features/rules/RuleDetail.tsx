import { cva } from "class-variance-authority";

import {
  conditionTokens,
  grainLabel,
  paramParts,
  paramText,
  scopeLabel,
  shortDate,
  type TokenKind,
  windowShort,
} from "./format";

import type { RuleVersion } from "./api";
import type { ReactNode } from "react";

type RuleDetailProps = {
  version: RuleVersion;
  /** All versions of the same key, newest first. */
  siblings: RuleVersion[];
  onSelectVersion: (id: number) => void;
  onNewVersion: () => void;
};

const dot = cva("inline-block flex-none rounded-full", {
  variants: {
    status: {
      active: "bg-low-dot",
      draft: "bg-draft-dot",
      approved: "bg-indigo-60",
      retired: "bg-retired-dot",
    },
    size: { tab: "size-1.5", history: "mt-[5px] size-[9px]" },
  },
});

const tab = cva(
  "flex h-[26px] items-center gap-1.5 rounded px-2.5 text-xs font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-yellow",
  {
    variants: {
      selected: {
        true: "bg-bg shadow-[0_1px_2px_rgba(37,39,70,.12),0_0_0_1px_var(--color-border)]",
        false: "bg-transparent",
      },
    },
  },
);

const token = cva("", {
  variants: {
    kind: {
      param: "font-bold text-yellow",
      variable: "font-bold text-ai-line",
      field: "text-white",
      constant: "text-code-constant",
      keyword: "text-code-keyword",
      plain: "text-indigo-20",
    } satisfies Record<TokenKind, string>,
  },
});

const historyRow = cva(
  "grid w-full grid-cols-[16px_56px_minmax(0,1fr)_auto] items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-hover",
  { variants: { selected: { true: "bg-bg-sub", false: "" } } },
);

const h2 = "text-[15px] font-semibold";

const byline = (v: RuleVersion) => {
  const by = v.author ?? "unknown";
  if (v.status === "draft") return `Drafted by ${by}, ${shortDate(v.createdAt)}`;
  if (v.status === "active") return `Active since ${shortDate(v.createdAt)} · by ${by}`;
  return `Created ${shortDate(v.createdAt)} · by ${by}`;
};

export function RuleDetail({
  version: v,
  siblings,
  onSelectVersion,
  onNewVersion,
}: RuleDetailProps) {
  const active = siblings.find((s) => s.status === "active");
  return (
    <section
      aria-label={`${v.key} v${v.version}`}
      className="flex max-w-[920px] flex-col gap-7 px-10 pt-7 pb-14"
    >
      <Header
        version={v}
        siblings={siblings}
        onSelectVersion={onSelectVersion}
        onNewVersion={onNewVersion}
      />
      {v.status === "draft" && <DraftNote draft={v} active={active} />}
      {v.status === "retired" && (
        <div className="rounded-md border border-border bg-bg-sub px-4 py-3 text-fg-muted">
          Retired. Kept for audit of cases flagged while it was active.
        </div>
      )}
      <section className="flex flex-col gap-2 rounded-lg bg-ai-bg px-6 py-5">
        <div className="text-[11px] font-bold tracking-[0.06em] text-ai-fg uppercase">
          What it flags
        </div>
        {v.explanation ? (
          <p className="text-[17px] leading-normal text-pretty">{v.explanation}</p>
        ) : (
          <p className="text-[17px] leading-normal text-fg-subtle italic">No explanation yet</p>
        )}
      </section>
      <Condition version={v} />
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-6">
        <Parameters version={v} />
        <Variables version={v} />
      </section>
      <History version={v} siblings={siblings} onSelectVersion={onSelectVersion} />
    </section>
  );
}

function Header({ version: v, siblings, onSelectVersion, onNewVersion }: RuleDetailProps) {
  const name = siblings[0]?.name ?? v.name;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-xs text-fg-subtle">
        Alert type {v.alertType} · {scopeLabel(v)} · {grainLabel[v.grain]}
        {v.replacesKey && ` · replaces ${v.replacesKey}`}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[260px] flex-1 flex-wrap items-baseline gap-3">
          <span className="font-mono text-2xl font-bold">{v.key}</span>
          {name && <h1 className="text-2xl leading-tight font-semibold text-pretty">{name}</h1>}
        </div>
        <button
          type="button"
          onClick={onNewVersion}
          className="h-8 rounded border border-indigo bg-bg px-3.5 text-[13px] font-semibold text-indigo hover:bg-indigo hover:text-white"
        >
          New version from v{v.version}
        </button>
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
              <span aria-hidden="true" className={dot({ status: s.status, size: "tab" })} />
              <span className="font-normal text-fg-muted">{s.status}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-fg-subtle">{byline(v)}</span>
      </div>
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
    <div className="flex flex-col gap-2 rounded-md border border-draft-line bg-sel px-4 py-3.5">
      <div className="font-semibold">Draft — not evaluating transactions yet</div>
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

const LEGEND: [string, string][] = [
  ["parameter", "bg-yellow"],
  ["variable", "bg-ai-line"],
  ["data field", "border border-border bg-white"],
  ["constant", "bg-code-constant"],
];

function Condition({ version: v }: { version: RuleVersion }) {
  const variables = new Set(v.variables.map((x) => x.name));
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className={h2}>Condition</h2>
      {v.anchor && (
        <div className="flex flex-wrap items-center gap-2 text-fg-muted">
          Evaluated at each transaction where
          <code className="rounded-[3px] border border-border-soft bg-bg-sub px-1.5 py-0.5 font-mono text-xs text-fg">
            {v.anchor}
          </code>
        </div>
      )}
      <div className="overflow-x-auto rounded-md bg-indigo px-[18px] py-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
        {conditionTokens(v.condition, variables).map((t) => (
          <span key={t.at} className={token({ kind: t.kind })}>
            {t.text}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-fg-subtle">
        {LEGEND.map(([label, swatch]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-[2px] ${swatch}`} />
            {label}
          </span>
        ))}
      </div>
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
    <div className="flex flex-col gap-2.5">
      <h2 className={h2}>Parameters</h2>
      {params.length ? (
        <Rows>
          {params.map(([name, param]) => {
            const { value, unit } = paramParts(param);
            return (
              <div key={name} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <span className="rounded-[3px] bg-yellow px-1.5 py-px font-mono text-[13px] font-bold text-indigo">
                  {name}
                </span>
                <span className="text-right font-mono text-[15px] font-bold">
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
    <div className="flex flex-col gap-2.5">
      <h2 className={h2}>Variables</h2>
      {v.variables.length ? (
        <Rows>
          {v.variables.map((x) => (
            <div key={x.name} className="flex flex-col gap-1.5 px-3.5 py-3">
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

type HistoryProps = Pick<RuleDetailProps, "version" | "siblings" | "onSelectVersion">;

function History({ version: v, siblings, onSelectVersion }: HistoryProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className={h2}>Version history</h2>
      <ul aria-label="Version history" className="flex flex-col">
        {siblings.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelectVersion(s.id)}
              className={historyRow({ selected: s.id === v.id })}
            >
              <span aria-hidden="true" className={dot({ status: s.status, size: "history" })} />
              <span className="font-mono font-bold">v{s.version}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold capitalize">{s.status}</span>
                <span className="text-pretty text-fg-muted">
                  {s.explanation ?? "No explanation yet"}
                </span>
              </span>
              <span className="text-right text-xs whitespace-nowrap text-fg-subtle">
                {s.author}
                <br />
                {shortDate(s.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
