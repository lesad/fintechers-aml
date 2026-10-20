import { cva } from "class-variance-authority";
import { useState } from "react";

import type { RuleVersion } from "./api";

const row = cva(
  "grid w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-x-2 border-l-3 py-1.5 pr-3 pl-[9px] text-left outline-none focus-visible:bg-hover",
  {
    variants: {
      selected: {
        true: "border-yellow bg-sel",
        false: "border-transparent hover:bg-hover",
      },
    },
  },
);

type Group = { key: string; versions: RuleVersion[] };

type RuleListProps = {
  /** Versions per key, newest first. */
  groups: Group[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onNew: () => void;
  onExport: () => void;
};

const newest = (g: Group) => g.versions[0];

export function RuleList({ groups, selectedKey, onSelect, onNew, onExport }: RuleListProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = groups.filter((g) => `${g.key} ${newest(g)?.name ?? ""}`.toLowerCase().includes(q));
  const alertTypes = [...new Set(shown.map((g) => newest(g)?.alertType ?? ""))].toSorted();

  return (
    <aside className="flex w-[280px] flex-none flex-col border-r border-border bg-bg print:hidden">
      <div className="flex flex-none gap-1.5 border-b border-border-soft p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter rules"
          aria-label="Filter rules"
          className="h-7 min-w-0 flex-1 rounded border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25"
        />
        <button
          type="button"
          onClick={onNew}
          className="h-7 flex-none rounded bg-indigo px-2.5 text-[13px] font-semibold text-white hover:bg-indigo-hover"
        >
          + New rule
        </button>
      </div>
      <nav aria-label="Rules" className="min-h-0 flex-1 overflow-auto">
        {alertTypes.map((type) => (
          <div key={type}>
            <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
              Alert type {type}
            </div>
            {shown
              .filter((g) => newest(g)?.alertType === type)
              .map((g) => (
                <RuleRow
                  key={g.key}
                  group={g}
                  selected={g.key === selectedKey}
                  onSelect={() => onSelect(g.key)}
                />
              ))}
          </div>
        ))}
        {shown.length === 0 && (
          <div className="px-4 py-6 text-fg-subtle">No rules match “{query.trim()}”.</div>
        )}
      </nav>
      <div className="flex flex-none border-t border-border-soft p-2">
        <button
          type="button"
          onClick={onExport}
          className="flex h-7 items-center gap-1.5 rounded px-2.5 text-[13px] font-semibold text-fg-muted hover:bg-hover hover:text-fg"
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4v11" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
          Export rules
        </button>
      </div>
    </aside>
  );
}

type RuleRowProps = { group: Group; selected: boolean; onSelect: () => void };

function RuleRow({ group, selected, onSelect }: RuleRowProps) {
  const active = group.versions.find((v) => v.status === "active");
  const draft = group.versions.find((v) => v.status === "draft" || v.status === "pending");
  return (
    <button type="button" aria-current={selected} onClick={onSelect} className={row({ selected })}>
      {/* The column fits a short key (A1); a longer one ends in an ellipsis, whole in the tooltip. */}
      <span className="truncate font-mono text-[13px] font-bold" title={group.key}>
        {group.key}
      </span>
      <span className="truncate font-semibold">{newest(group)?.name ?? group.key}</span>
      <span />
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
        <span>{active ? `v${active.version} active` : "no active version"}</span>
        {draft && (
          <span className="rounded-[3px] border border-draft-line bg-sel px-1.5 text-[11px] font-semibold text-draft-fg">
            {draft.status} v{draft.version}
          </span>
        )}
      </span>
    </button>
  );
}
