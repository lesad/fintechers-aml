import { cn } from "@/utils";

export type CaseStatus = "New" | "In review" | "Escalated" | "Closed";

/** Status with a ring dot: hollow for New, filled otherwise; Closed is muted, Escalated bold. */
export function StatusLabel({ status }: { status: CaseStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        status === "Closed" ? "text-fg-subtle" : "text-fg",
        status === "Escalated" && "font-semibold",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full border-[1.5px] border-current",
          status === "New" ? "bg-transparent" : "bg-current",
        )}
      />
      {status}
    </span>
  );
}
