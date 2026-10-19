import { cva } from "class-variance-authority";

import type { RuleVersion } from "./api";

const badge = cva(
  "inline-block rounded-[3px] px-1.5 text-[11px] leading-[18px] whitespace-nowrap",
  {
    variants: {
      status: {
        active: "bg-low-bg text-low",
        draft: "border border-flow-mark/40 bg-sel text-med",
        approved: "bg-border-soft text-fg",
        retired: "bg-border-soft text-fg-subtle",
      },
    },
  },
);

export function StatusBadge({ version, status }: Pick<RuleVersion, "version" | "status">) {
  return (
    <span className={badge({ status })}>
      v{version} {status}
    </span>
  );
}
