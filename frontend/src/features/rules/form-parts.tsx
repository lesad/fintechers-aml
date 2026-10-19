import { cva } from "class-variance-authority";

import type { Issue } from "./rule-draft";
import type { ReactNode } from "react";

/** A text input in the rule editor. */
export const field = cva(
  "box-border h-7 rounded border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25 disabled:bg-bg-sub",
  {
    variants: {
      mono: { true: "font-mono", false: "" },
      align: { left: "", right: "text-right font-bold" },
    },
    defaultVariants: { mono: false, align: "left" },
  },
);

const option = cva(
  "h-6 rounded px-2.5 text-[13px] font-semibold text-fg disabled:cursor-not-allowed disabled:text-fg-subtle",
  {
    variants: {
      selected: {
        true: "bg-bg shadow-[0_1px_2px_rgba(37,39,70,.12),0_0_0_1px_var(--color-border)]",
        false: "bg-transparent enabled:hover:bg-hover",
      },
    },
  },
);

type SegmentedProps<T extends string> = {
  label: string;
  options: readonly (readonly [T, string])[];
  value: string;
  onChange: (value: T) => void;
  disabled?: boolean;
};

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-0.5 self-start rounded-md border border-border bg-bg-sub p-0.5"
    >
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={key === value}
          disabled={disabled}
          onClick={() => onChange(key)}
          className={option({ selected: key === value })}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function ChangedBadge({ show, base }: { show: boolean; base: number | null }) {
  if (!show || base === null) return null;
  return (
    <span className="rounded-[3px] border border-draft-line bg-sel px-1.5 py-px text-[11px] font-semibold text-draft-fg">
      changed from v{base}
    </span>
  );
}

export function SectionTitle({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {children}
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  );
}

const issueText = cva("flex flex-wrap items-center gap-2 text-xs", {
  variants: { level: { error: "text-med", warn: "text-fg-subtle" } },
});

const issueDot = cva("size-1.5 flex-none rounded-full", {
  variants: { level: { error: "bg-med", warn: "bg-fg-subtle" } },
});

export function Issues({ issues, onFix }: { issues: Issue[]; onFix: (issue: Issue) => void }) {
  return issues.map((issue) => (
    <div key={issue.text} className={issueText({ level: issue.level })}>
      <span aria-hidden="true" className={issueDot({ level: issue.level })} />
      <span>{issue.text}</span>
      {issue.fix && (
        <button
          type="button"
          onClick={() => onFix(issue)}
          className="h-[22px] rounded border border-border bg-bg px-2 text-xs font-semibold text-fg hover:border-indigo"
        >
          {issue.fix.label}
        </button>
      )}
    </div>
  ));
}

export const addButton =
  "h-[26px] self-start rounded border border-dashed border-border px-2.5 text-[13px] font-semibold text-fg-muted hover:border-indigo hover:text-fg";

export const removeButton =
  "size-7 rounded text-[15px] text-fg-subtle hover:bg-border-soft hover:text-fg";
