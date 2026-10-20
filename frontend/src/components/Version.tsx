import { cva } from "class-variance-authority";
import { useState } from "react";

/** The lifecycle a versioned thing moves through: a rule version and a triage config share it. */
export type VersionStatus = "draft" | "pending" | "approved" | "active" | "retired";

/** What each status is called on screen. A version waiting for its approver reads "in review", as the design has it. */
const STATUS_LABEL: Record<VersionStatus, string> = {
  draft: "draft",
  pending: "in review",
  approved: "approved",
  active: "active",
  retired: "retired",
};

const dot = cva("flex-none rounded-full", {
  variants: {
    status: {
      active: "bg-low-dot",
      draft: "bg-draft-dot",
      pending: "bg-draft-dot",
      approved: "bg-indigo-60",
      retired: "bg-retired-dot",
    },
    size: { tab: "size-1.5", row: "mt-[5px] size-[9px]" },
  },
  defaultVariants: { size: "tab" },
});

const tab = cva(
  "flex h-[22px] items-center gap-1.5 rounded px-2 text-xs font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-yellow",
  {
    variants: {
      selected: {
        true: "bg-bg shadow-[0_1px_2px_rgba(37,39,70,.12),0_0_0_1px_var(--color-border)]",
        false: "bg-transparent",
      },
    },
  },
);

export type VersionTab = { version: number; status: VersionStatus };

type VersionTabsProps = {
  /** The versions worth a pill — the one being decided and the live one, newest first. */
  items: VersionTab[];
  selected: number;
  onSelect: (version: number) => void;
  /** Who wrote it and where it stands, shown beside the pills. */
  byline?: string;
  label?: string;
};

/** The versions a reader switches between at a glance, with the byline of the one they are on. */
export function VersionTabs({
  items,
  selected,
  onSelect,
  byline,
  label = "Versions",
}: VersionTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-0.5 rounded-md border border-border bg-bg-sub p-0.5"
      >
        {items.map((item) => (
          <button
            key={item.version}
            type="button"
            role="tab"
            aria-selected={item.version === selected}
            onClick={() => onSelect(item.version)}
            className={tab({ selected: item.version === selected })}
          >
            <span>v{item.version}</span>
            <span aria-hidden="true" className={dot({ status: item.status })} />
            <span className="font-normal text-fg-muted">{STATUS_LABEL[item.status]}</span>
          </button>
        ))}
      </div>
      {byline && <span className="text-xs text-fg-subtle">{byline}</span>}
    </div>
  );
}

export type VersionHistoryItem = {
  version: number;
  status: VersionStatus;
  /** One line on what this version is or changed. */
  note: string;
  author: string;
  /** Already formatted for a reader; this component never parses a date. */
  date: string;
};

/**
 * The design lays a history row out as `16px 56px minmax(0,1fr) auto` with 10px gaps and 6px/10px padding; the
 * selected row sits on the sub background and any row lights up on hover.
 */
const row = cva(
  "grid w-full grid-cols-[16px_56px_minmax(0,1fr)_auto] items-start gap-2.5 rounded px-2.5 py-1.5 text-left hover:bg-hover",
  { variants: { selected: { true: "bg-bg-sub" } } },
);

/** How many versions a history shows before the reader asks for more. */
const PAGE = 10;

type VersionHistoryProps = {
  /** Every stored version, newest first — the order this renders them in. */
  items: VersionHistoryItem[];
  /** The version the page is showing. */
  selected: number;
  onSelect: (version: number) => void;
  /** Names the list for a screen reader when a page has more than one. */
  label?: string;
};

/**
 * Every version of one thing, newest first, each row selecting what the page shows.
 *
 * Only the newest [PAGE] are listed, and "Show more" reveals the next [PAGE]. Deliberately a button rather than the
 * queue's scroll sentinel: the whole list is already in the browser, so a sentinel would reveal everything the
 * moment it came into view — which is the long scroll this is here to prevent.
 */
export function VersionHistory({
  items,
  selected,
  onSelect,
  label = "Version history",
}: VersionHistoryProps) {
  const [shown, setShown] = useState(PAGE);
  const visible = items.slice(0, shown);

  return (
    <section aria-label={label} className="flex flex-col gap-1.5">
      <h2 className="text-[13px] font-semibold">Version history</h2>
      <div className="flex flex-col">
        {visible.map((item) => (
          <button
            key={item.version}
            type="button"
            aria-current={item.version === selected}
            onClick={() => onSelect(item.version)}
            className={row({ selected: item.version === selected })}
          >
            <span aria-hidden="true" className={dot({ status: item.status, size: "row" })} />
            <span className="font-mono font-bold">v{item.version}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{sentence(STATUS_LABEL[item.status])}</span>
              <span className="text-pretty text-fg-muted">{item.note}</span>
            </span>
            <span className="text-right text-xs whitespace-nowrap text-fg-subtle">
              {item.author}
              <br />
              {item.date}
            </span>
          </button>
        ))}
      </div>
      {visible.length < items.length && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="rounded border border-border bg-bg px-2.5 py-1 text-xs font-semibold text-fg hover:bg-hover"
          >
            Show {Math.min(PAGE, items.length - visible.length)} more
          </button>
          <span className="text-xs text-fg-subtle">
            {visible.length} of {items.length} versions
          </span>
        </div>
      )}
    </section>
  );
}

/** `in review` → `In review`, the form the design's history rows carry. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
