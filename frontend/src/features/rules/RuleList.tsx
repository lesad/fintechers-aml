import { cva } from "class-variance-authority";

import { StatusBadge } from "./StatusBadge";

import type { RuleVersion } from "./api";

const row = cva(
  "flex w-full flex-wrap items-center gap-1.5 border-b border-border-soft px-3 py-2 text-left outline-none focus-visible:bg-hover",
  {
    variants: {
      selected: {
        true: "bg-sel shadow-[inset_3px_0_0_var(--color-yellow)]",
        false: "hover:bg-hover",
      },
    },
  },
);

type RuleListProps = {
  groups: { key: string; versions: RuleVersion[] }[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export function RuleList({ groups, selectedKey, onSelect }: RuleListProps) {
  return (
    <nav aria-label="Rules">
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          aria-current={group.key === selectedKey}
          onClick={() => onSelect(group.key)}
          className={row({ selected: group.key === selectedKey })}
        >
          <span className="mr-1 font-mono text-[13px] font-semibold">{group.key}</span>
          {group.versions.map((v) => (
            <StatusBadge key={v.id} version={v.version} status={v.status} />
          ))}
        </button>
      ))}
    </nav>
  );
}
