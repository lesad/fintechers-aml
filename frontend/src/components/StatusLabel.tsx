import { cva } from "class-variance-authority";

export type CaseStatus = "New" | "In review" | "Escalated" | "Closed";

const label = cva("inline-flex items-center gap-1.5", {
  variants: {
    status: {
      New: "text-fg",
      "In review": "text-fg",
      Escalated: "font-semibold text-fg",
      Closed: "text-fg-subtle",
    },
    /** A small framed chip (the detail header). */
    boxed: { true: "h-[22px] rounded border border-border px-2 text-xs font-medium text-fg" },
  },
  compoundVariants: [{ status: "Escalated", boxed: true, className: "font-bold" }],
});

const dot = cva("size-1.5 flex-none rounded-full border-[1.5px] border-current", {
  variants: {
    status: {
      New: "bg-transparent",
      "In review": "bg-current",
      Escalated: "bg-current",
      Closed: "bg-current",
    },
  },
});

/** Status with a ring dot: hollow for New, filled otherwise; Closed is muted, Escalated bold. */
export function StatusLabel({ status, boxed = false }: { status: CaseStatus; boxed?: boolean }) {
  return (
    <span className={label({ status, boxed })}>
      <span className={dot({ status })} />
      {status}
    </span>
  );
}
