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
  rowTitle?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  /** Below this width the table scrolls sideways instead of squeezing columns. */
  minWidth?: number;
  empty?: ReactNode;
};

/**
 * Fills the remaining height of its flex column and scrolls on its own; the header
 * row is sticky, so only the body moves.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowTitle,
  rowClassName,
  minWidth,
  empty,
}: TableProps<T>) {
  const pad = (i: number) => cn("px-3", i === 0 && "pl-4", i === columns.length - 1 && "pr-4");

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-collapse" style={{ minWidth }}>
        <thead>
          <tr className="h-[34px] text-left text-xs text-fg-muted">
            {columns.map((c, i) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={cn(
                  // Inset shadow, not border-b: a collapsed border doesn't stick with the header.
                  "sticky top-0 z-10 bg-bg-sub font-semibold whitespace-nowrap shadow-[inset_0_-1px_0_var(--color-border)]",
                  c.align === "right" && "text-right",
                  pad(i),
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              title={rowTitle?.(row)}
              onClick={onRowClick && ((e) => onRowClick(row, e))}
              className={cn(
                "h-9 border-b border-border-soft",
                onRowClick && "cursor-pointer hover:bg-hover",
                rowClassName?.(row),
              )}
            >
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    "overflow-hidden whitespace-nowrap",
                    c.align === "right" && "text-right",
                    pad(i),
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && empty && <div className="px-4 py-10 text-fg-subtle">{empty}</div>}
    </div>
  );
}
