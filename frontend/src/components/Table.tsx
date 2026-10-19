import { cva } from "class-variance-authority";

import { cn } from "@/utils";

import type { MouseEvent, ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Fixed width in px; columns without one share the rest. */
  width?: number;
  align?: "left" | "right";
  /** Extra classes for this column's body cells. */
  className?: string;
  cell: (row: T) => ReactNode;
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T, e: MouseEvent<HTMLTableRowElement>) => void;
  /** Limits `onRowClick` (and the pointer/hover) to some rows; all rows when omitted. */
  rowClickable?: (row: T) => boolean;
  rowTitle?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /** Below this width the table scrolls sideways instead of squeezing columns. */
  minWidth?: number;
  empty?: ReactNode;
  /** Under the rows, inside the scroll area: a loader for the next page. */
  footer?: ReactNode;
  /**
   * Inside a card: dense rows, a plain non-sticky header, sideways scroll only.
   * Default is a page table that fills its flex column and scrolls under a sticky header.
   */
  embedded?: boolean;
};

const container = cva("", {
  variants: { embedded: { true: "overflow-x-auto", false: "min-h-0 flex-1 overflow-auto" } },
});

const headRow = cva("text-left text-xs text-fg-muted", {
  variants: { embedded: { true: "h-[26px]", false: "h-[34px]" } },
});

const headCell = cva("font-semibold whitespace-nowrap", {
  variants: {
    embedded: {
      true: "border-y border-border-soft",
      // Inset shadow, not border-b: a collapsed border doesn't stick with the header.
      false: "sticky top-0 z-10 bg-bg-sub shadow-[inset_0_-1px_0_var(--color-border)]",
    },
  },
});

const row = cva("border-b border-border-soft", {
  variants: {
    embedded: { true: "h-7", false: "h-9" },
    clickable: { true: "cursor-pointer hover:bg-hover" },
  },
});

const cell = cva("", {
  variants: {
    embedded: { true: "px-2.5", false: "px-3" },
    edge: { first: "", last: "", none: "" },
    align: { left: "", right: "text-right" },
  },
  compoundVariants: [
    { embedded: true, edge: "first", className: "pl-3.5" },
    { embedded: true, edge: "last", className: "pr-3.5" },
    { embedded: false, edge: "first", className: "pl-4" },
    { embedded: false, edge: "last", className: "pr-4" },
  ],
  defaultVariants: { edge: "none", align: "left" },
});

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClickable,
  rowTitle,
  rowClassName,
  minWidth,
  empty,
  footer,
  embedded = false,
}: TableProps<T>) {
  const edge = (i: number) => (i === 0 ? "first" : i === columns.length - 1 ? "last" : "none");

  return (
    <div className={container({ embedded })}>
      <table className="w-full table-fixed border-collapse" style={{ minWidth }}>
        <thead>
          <tr className={headRow({ embedded })}>
            {columns.map((c, i) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={cn(
                  headCell({ embedded }),
                  cell({ embedded, edge: edge(i), align: c.align }),
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const clickable = !!onRowClick && (rowClickable?.(r) ?? true);
            return (
              <tr
                key={rowKey(r)}
                title={rowTitle?.(r)}
                onClick={clickable ? (e) => onRowClick?.(r, e) : undefined}
                className={cn(row({ embedded, clickable }), rowClassName?.(r))}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      "overflow-hidden whitespace-nowrap",
                      cell({ embedded, edge: edge(i), align: c.align }),
                      c.className,
                    )}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && empty && <div className="px-4 py-10 text-fg-subtle">{empty}</div>}
      {footer}
    </div>
  );
}
