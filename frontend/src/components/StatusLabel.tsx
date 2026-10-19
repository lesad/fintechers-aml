import { cva } from "class-variance-authority";

export type CaseStatus = "New" | "Escalated" | "False Positive" | "Reported";

const label = cva("inline-flex items-center gap-1.5", {
  variants: {
    status: {
      New: "text-fg",
      Escalated: "font-semibold text-fg",
      "False Positive": "text-fg-subtle",
      Reported: "font-semibold text-fg",
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
      Escalated: "bg-current",
      "False Positive": "bg-current",
      Reported: "bg-current",
    },
  },
});

/** Status with a ring dot: hollow for New, filled otherwise; False Positive is muted, Escalated and Reported bold. */
export function StatusLabel({ status, boxed = false }: { status: CaseStatus; boxed?: boolean }) {
  return (
    <span className={label({ status, boxed })}>
      <span className={dot({ status })} />
      {status}
    </span>
  );
}
