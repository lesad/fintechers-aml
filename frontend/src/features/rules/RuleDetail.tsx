import { cva } from "class-variance-authority";

import { Card } from "@/components";

import { grainLabel, paramLabel, scopeLabel, windowLabel } from "./format";
import { StatusBadge } from "./StatusBadge";

import type { RuleVersion } from "./api";
import type { ReactNode } from "react";

const versionButton = cva("rounded outline-none focus-visible:ring-2 focus-visible:ring-yellow", {
  variants: { current: { true: "ring-1 ring-fg-subtle", false: "opacity-80 hover:opacity-100" } },
});

type RuleDetailProps = {
  version: RuleVersion;
  /** All versions of the same key, newest first. */
  siblings: RuleVersion[];
  onSelectVersion: (id: number) => void;
  actions?: ReactNode;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] tracking-[0.04em] text-fg-subtle uppercase">{label}</span>
      {children}
    </div>
  );
}

const code = "rounded bg-bg-sub px-1.5 py-1 font-mono text-xs break-words text-fg";

export function RuleDetail({ version: v, siblings, onSelectVersion, actions }: RuleDetailProps) {
  return (
    <section aria-label={`${v.key} v${v.version}`} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="font-mono">{v.key}</span>
          <StatusBadge version={v.version} status={v.status} />
          {v.author && (
            <span className="text-xs font-normal text-fg-subtle">
              by {v.author}, {v.createdAt.slice(0, 10)}
            </span>
          )}
        </h2>
        <p className="text-xs text-fg-muted">
          Alert type {v.alertType} · {scopeLabel(v)} · {grainLabel[v.grain]}
          {v.replacesKey && ` · replaces ${v.replacesKey}`}
        </p>
      </header>

      <Card tone="ai" title="What it flags">
        {v.explanation ? (
          <p className="text-[13px] text-fg">{v.explanation}</p>
        ) : (
          <p className="text-[13px] text-fg-subtle italic">No explanation yet</p>
        )}
      </Card>

      {v.anchor && (
        <Field label="Anchor transactions">
          <code className={code}>{v.anchor}</code>
        </Field>
      )}
      <Field label="Condition">
        <code className={code}>{v.condition}</code>
      </Field>
      <Field label="Parameters">
        {Object.keys(v.params).length ? (
          Object.entries(v.params).map(([name, param]) => (
            <code key={name} className={code}>
              {paramLabel(name, param)}
            </code>
          ))
        ) : (
          <span className="text-xs text-fg-subtle">none</span>
        )}
      </Field>
      <Field label="Variables">
        {v.variables.length ? (
          v.variables.map((variable) => (
            <code key={variable.name} className={code}>
              {variable.name} = {variable.agg} of {variable.field} where {variable.filter} ·{" "}
              {windowLabel(variable.window)}
            </code>
          ))
        ) : (
          <span className="text-xs text-fg-subtle">none</span>
        )}
      </Field>
      <Field label="Versions">
        <div className="flex flex-wrap gap-1.5">
          {siblings.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectVersion(s.id)}
              className={versionButton({ current: s.id === v.id })}
            >
              <StatusBadge version={s.version} status={s.status} />
            </button>
          ))}
        </div>
      </Field>
      {actions}
    </section>
  );
}
