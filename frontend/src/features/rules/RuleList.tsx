import { cva } from "class-variance-authority";
import { useState } from "react";

import type { RuleVersion } from "./api";

const row = cva(
  "grid w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 border-l-3 py-2.5 pr-4 pl-[13px] text-left outline-none focus-visible:bg-hover",
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
};

const newest = (g: Group) => g.versions[0];

export function RuleList({ groups, selectedKey, onSelect, onNew }: RuleListProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = groups.filter((g) => `${g.key} ${newest(g)?.name ?? ""}`.toLowerCase().includes(q));
  const alertTypes = [...new Set(shown.map((g) => newest(g)?.alertType ?? ""))].toSorted();

  return (
    <aside className="flex w-80 flex-none flex-col border-r border-border bg-bg">
      <div className="flex flex-none gap-2 border-b border-border-soft p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter rules"
          aria-label="Filter rules"
          className="h-[30px] min-w-0 flex-1 rounded border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25"
        />
        <button
          type="button"
          onClick={onNew}
          className="h-[30px] flex-none rounded bg-indigo px-3 text-[13px] font-semibold text-white hover:bg-indigo-hover"
        >
          + New rule
        </button>
      </div>
      <nav aria-label="Rules" className="min-h-0 flex-1 overflow-auto">
        {alertTypes.map((type) => (
          <div key={type}>
            <div className="px-4 pt-3.5 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
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
    </aside>
  );
}

type RuleRowProps = { group: Group; selected: boolean; onSelect: () => void };

function RuleRow({ group, selected, onSelect }: RuleRowProps) {
  const active = group.versions.find((v) => v.status === "active");
  const draft = group.versions.find((v) => v.status === "draft");
  return (
    <button type="button" aria-current={selected} onClick={onSelect} className={row({ selected })}>
      <span className="font-mono text-[13px] font-bold">{group.key}</span>
      <span className="truncate font-semibold">{newest(group)?.name ?? group.key}</span>
      <span />
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
        <span>{active ? `v${active.version} active` : "no active version"}</span>
        {draft && (
          <span className="rounded-[3px] border border-draft-line bg-sel px-1.5 text-[11px] font-semibold text-draft-fg">
            draft v{draft.version}
          </span>
        )}
      </span>
    </button>
  );
}
