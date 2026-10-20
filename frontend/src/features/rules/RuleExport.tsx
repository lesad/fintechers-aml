import { useState } from "react";

import { grainLabel, paramText, scopeLabel, shortDate, windowShort } from "./format";
import { type LiveSpan, rulesValidAt, versionChanges } from "./rule-export";

import type { RuleVersion } from "./api";
import type { ReactNode } from "react";

type RuleExportProps = {
  versions: RuleVersion[];
  /** Named on the report as the person who generated it. */
  author: string;
  onClose: () => void;
};

/** `Date` → `2026-10-20 09:01` in local time. */
const localStamp = (d: Date) => d.toLocaleString("sv-SE").slice(0, 16);

const button = "h-7 rounded border border-border bg-bg px-3 text-[13px] text-fg hover:bg-hover";
const th =
  "border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold text-fg-subtle uppercase";
const td = "border-b border-border-soft px-2 py-1.5 align-top";

export function RuleExport({ versions, author, onClose }: RuleExportProps) {
  const [at, setAt] = useState(() => localStamp(new Date()).replace(" ", "T"));
  const date = new Date(at);
  const valid = Number.isNaN(date.getTime()) ? null : rulesValidAt(versions, date);

  return (
    <div className="flex flex-col gap-4 px-6 pt-4 pb-8 print:p-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          Rules valid at
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className="h-7 rounded border border-border bg-bg px-2 font-normal text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25"
          />
        </label>
        <button
          type="button"
          disabled={!valid}
          onClick={() => window.print()}
          className="h-7 rounded bg-indigo px-3 text-[13px] font-semibold text-white hover:bg-indigo-hover disabled:bg-retired-dot"
        >
          Print / Save as PDF
        </button>
        <button type="button" onClick={onClose} className={button}>
          Close
        </button>
      </div>

      {valid ? (
        <article
          aria-label="Rules export"
          className="flex max-w-[1040px] flex-col gap-6 rounded-md border border-border bg-bg p-8 print:max-w-none print:border-0 print:p-0"
        >
          <header className="flex flex-col gap-1 border-b-2 border-indigo pb-3">
            <h1 className="text-xl font-bold">AML transaction monitoring rules in force</h1>
            <div className="text-sm">
              Reference date <strong>{at.replace("T", " ")}</strong>
            </div>
            <div className="text-xs text-fg-subtle">
              Generated {localStamp(new Date())}
              {author && ` by ${author}`} · {valid.length} rules · versions valid from their
              approval until the next version is approved
            </div>
          </header>

          {valid.length === 0 ? (
            <p className="text-fg-subtle">No rule was in force at this date.</p>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={th}>Rule</th>
                  <th className={th}>Name</th>
                  <th className={th}>Alert type</th>
                  <th className={th}>Version</th>
                  <th className={th}>In force since</th>
                </tr>
              </thead>
              <tbody>
                {valid.map(({ key, valid: s }) => (
                  <tr key={key}>
                    <td className={`${td} font-mono font-bold`}>{key}</td>
                    <td className={td}>{s.version.name}</td>
                    <td className={td}>{s.version.alertType}</td>
                    <td className={td}>v{s.version.version}</td>
                    <td className={td}>{shortDate(s.from)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {valid.map((r) => (
            <RuleSection key={r.key} span={r.valid} history={r.history} />
          ))}
        </article>
      ) : (
        <p className="text-fg-subtle">Pick a date and time.</p>
      )}
    </div>
  );
}

function RuleSection({ span, history }: { span: LiveSpan; history: LiveSpan[] }) {
  const v = span.version;
  return (
    <section
      aria-label={`${v.key} v${v.version}`}
      className="flex flex-col gap-3 border-t border-border pt-5 print:break-before-page print:border-0 print:pt-0"
    >
      <div>
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-lg font-bold">{v.key}</span>
          <h2 className="text-lg font-semibold">{v.name}</h2>
        </div>
        <div className="text-xs text-fg-subtle">
          Version {v.version} · alert type {v.alertType} · {scopeLabel(v)} · {grainLabel[v.grain]}
          {v.replacesKey && ` · replaces ${v.replacesKey}`}
        </div>
      </div>

      <Facts>
        <Fact label="In force">
          {shortDate(span.from)} – {span.until ? shortDate(span.until) : "still in force"}
        </Fact>
        <Fact label="Author">{v.author ?? "unknown"}</Fact>
        <Fact label="Approved by">
          {v.approver
            ? `${v.approver}, ${shortDate(v.approvedAt ?? "")}`
            : "seeded, no approval recorded"}
        </Fact>
        <Fact label="Created">{shortDate(v.createdAt)}</Fact>
      </Facts>

      {v.version > 1 && (
        <Block title="Why this change">
          {v.changeReason ?? (
            <span className="text-fg-subtle italic">
              Not recorded: saved before a reason was required.
            </span>
          )}
        </Block>
      )}

      <Block title="What it flags">
        {v.explanation ?? <span className="text-fg-subtle italic">No explanation recorded.</span>}
        {v.explanationModel && (
          <div className="mt-1 text-xs text-fg-subtle">Written by {v.explanationModel}</div>
        )}
      </Block>

      <Block title="Condition">
        {v.anchor && (
          <div className="mb-1 text-xs">
            Evaluated at each transaction where <code className="font-mono">{v.anchor}</code>
          </div>
        )}
        <code className="block rounded border border-border bg-bg-sub px-3 py-2 font-mono text-xs whitespace-pre-wrap">
          {v.condition}
        </code>
      </Block>

      <Block title="Parameters">
        {Object.keys(v.params).length ? (
          <Facts>
            {Object.entries(v.params).map(([name, p]) => (
              <Fact key={name} label={name}>
                <span className="font-mono">{paramText(p)}</span>
              </Fact>
            ))}
          </Facts>
        ) : (
          "None"
        )}
      </Block>

      <Block title="Variables">
        {v.variables.length
          ? v.variables.map((x) => (
              <div key={x.name} className="font-mono text-xs">
                <strong>{x.name}</strong> = {x.agg} of {x.field} where {x.filter} · window{" "}
                {windowShort(x.window)}
              </div>
            ))
          : "None"}
      </Block>

      <Block title="Version history up to the reference date">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={th}>Version</th>
              <th className={th}>In force</th>
              <th className={th}>Author</th>
              <th className={th}>Approved by</th>
              <th className={th}>Changes</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => {
              const before = history[i + 1];
              return (
                <tr key={h.version.id}>
                  <td className={td}>v{h.version.version}</td>
                  <td className={td}>
                    {shortDate(h.from)} – {h.until ? shortDate(h.until) : "still in force"}
                  </td>
                  <td className={td}>{h.version.author ?? "unknown"}</td>
                  <td className={td}>{h.version.approver ?? "—"}</td>
                  <td className={td}>
                    {before
                      ? versionChanges(before.version, h.version).join("; ") || "no rule change"
                      : "first version"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Block>
    </section>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 break-inside-avoid text-sm">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 text-sm">{children}</dl>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
