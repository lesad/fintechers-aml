import { cva } from "class-variance-authority";

import { cn } from "@/utils";

import type { ReactNode } from "react";

const subTab = cva(
  "relative -mb-px cursor-pointer border-0 bg-transparent px-1 pt-2 pb-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-yellow",
  {
    variants: {
      active: {
        true: "font-semibold text-fg shadow-[inset_0_-2px_0_var(--color-indigo)]",
        false: "text-fg-muted hover:text-fg",
      },
    },
  },
);

export type SubTabItem<Id extends string = string> = {
  id: Id;
  label: ReactNode;
};

type SubTabsProps<Id extends string> = {
  /** Names the tablist for assistive tech, e.g. "Settings sections". */
  label: string;
  items: readonly SubTabItem<Id>[];
  activeId: Id;
  onSelect: (id: Id) => void;
  className?: string;
};

/**
 * An underline-style sub-tab bar: a row of buttons on a hairline, the active one underlined. A section
 * switcher inside a tab, not the tab strip itself. Presentational — the caller owns which one is active.
 */
export function SubTabs<Id extends string>({
  label,
  items,
  activeId,
  onSelect,
  className,
}: SubTabsProps<Id>) {
  const move = (from: number, step: number) => {
    const next = items[(from + step + items.length) % items.length];
    if (next) onSelect(next.id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex flex-none items-stretch gap-5 border-b border-border px-4",
        "print:hidden",
        className,
      )}
    >
      {items.map((item, i) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={subTab({ active })}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
