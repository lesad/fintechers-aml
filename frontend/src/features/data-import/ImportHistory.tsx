import { cva } from "class-variance-authority";

import { Card, type Column, Table } from "@/components";

import { formatCount, formatDuration, formatStamp } from "./format";

import type { ImportJob } from "./api";

const statusDot = cva("size-1.5 flex-none rounded-full", {
  variants: {
    status: {
      COMPLETED: "bg-low-dot",
      PARTIAL: "bg-med-dot",
      FAILED: "bg-high-dot",
      running: "bg-fg-subtle",
    },
  },
});

const statusText = cva("inline-flex items-center gap-1.5", {
  variants: {
    status: {
      COMPLETED: "font-medium text-fg",
      PARTIAL: "font-semibold text-fg",
      FAILED: "font-bold text-high",
      running: "text-fg-muted",
    },
  },
});

const LABEL = {
  COMPLETED: "Completed",
  PARTIAL: "Partial",
  FAILED: "Failed",
  running: "Running",
} as const;

const columns: Column<ImportJob>[] = [
  {
    key: "file",
    header: "File",
    className: "font-mono text-xs text-ellipsis",
    // A rule approval's recalculation has no file; it names the approved version.
    cell: (j) => j.fileName ?? <span className="font-sans">Recalculation · {j.rule} approved</span>,
  },
  {
    key: "at",
    header: "Uploaded",
    width: 136,
    className: "text-fg-muted tabular-nums",
    cell: (j) => formatStamp(j.startedAt),
  },
  { key: "by", header: "By", width: 120, className: "text-ellipsis", cell: (j) => j.by ?? "—" },
  {
    key: "rows",
    header: "Rows",
    width: 96,
    align: "right",
    className: "tabular-nums",
    cell: (j) => (j.status === "FAILED" || j.rule !== null ? "—" : formatCount(j.rowsImported)),
  },
  {
    key: "alerts",
    header: "Alerts",
    width: 80,
    align: "right",
    className: "tabular-nums",
    cell: (j) => (j.alerts === null ? "—" : formatCount(j.alerts)),
  },
  {
    key: "dur",
    header: "Duration",
    width: 80,
    align: "right",
    className: "text-fg-muted tabular-nums",
    cell: (j) => formatDuration(j.startedAt, j.finishedAt),
  },
  {
    key: "status",
    header: "Status",
    width: 240,
    className: "text-ellipsis",
    cell: (j) => {
      const status = j.status ?? "running";
      return (
        <span title={j.note ?? undefined}>
          <span className={statusText({ status })}>
            <span className={statusDot({ status })} />
            {LABEL[status]}
          </span>
          {j.note && <span className="text-fg-subtle"> · {j.note}</span>}
        </span>
      );
    },
  },
];

/** Every uploaded file, newest first, with what became of it. */
export function ImportHistory({ jobs }: { jobs: ImportJob[] }) {
  return (
    <Card
      padded={false}
      title={<span className="text-sm font-bold text-fg">Import history</span>}
      aside={
        <span className="text-xs text-fg-subtle">
          {jobs.length} {jobs.length === 1 ? "file" : "files"}
        </span>
      }
    >
      <Table
        embedded
        columns={columns}
        rows={jobs}
        rowKey={(j) => String(j.id)}
        minWidth={860}
        empty="No imports yet. Upload a file to load transactions into the application."
      />
    </Card>
  );
}
