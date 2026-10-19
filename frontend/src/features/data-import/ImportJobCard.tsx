import { cva } from "class-variance-authority";

import { formatCount, formatDuration, formatSize, formatStamp } from "./format";

import type { ImportJob } from "./api";

const STAGES = ["Upload", "Validate", "Import rows", "Run rules"] as const;

/** Which of the four steps is current: 0 while the file uploads, 4 once the job has ended. */
const stepOf = (job: ImportJob | null) =>
  !job ? 0 : { VALIDATE: 1, IMPORT: 2, RUN: 3, DONE: 4, FAILED: 4 }[job.stage];

/** How full the bar is; only the row import moves within its step. */
const percentOf = (job: ImportJob | null) => {
  if (!job) return 5;
  if (job.stage === "IMPORT" && job.rowsTotal)
    return 25 + Math.round((55 * job.rowsImported) / job.rowsTotal);
  return { VALIDATE: 20, IMPORT: 25, RUN: 85, DONE: 100, FAILED: 100 }[job.stage];
};

const bar = cva("h-full rounded-full transition-[width] duration-200", {
  variants: { state: { running: "bg-fg", done: "bg-low-dot", failed: "bg-high-dot" } },
});

const step = cva("flex items-center gap-2 rounded-md px-2.5 py-2", {
  variants: { state: { active: "bg-sel", done: "bg-bg-sub", idle: "bg-bg-sub" } },
});

const stepMark = cva(
  "flex size-[18px] flex-none items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold",
  {
    variants: {
      state: {
        active: "border-fg text-fg",
        done: "border-fg bg-fg text-white",
        idle: "border-border text-fg-subtle",
      },
    },
  },
);

const stepLabel = cva("text-xs", {
  variants: {
    state: { active: "font-bold text-fg", done: "font-medium text-fg", idle: "text-fg-subtle" },
  },
});

/** The line under the bar, per step. */
const DETAIL: Record<ImportJob["stage"], (job: ImportJob) => string> = {
  VALIDATE: () => "Checking columns, clients and currencies",
  IMPORT: (j) => `${formatCount(j.rowsImported)} of ${formatCount(j.rowsTotal ?? 0)} rows`,
  RUN: () => "Running the active rules and triage over the data",
  DONE: (j) => j.note ?? `${formatCount(j.rowsImported)} rows imported.`,
  FAILED: (j) => j.note ?? "The import failed.",
};

const detailOf = (job: ImportJob | null, size: number) =>
  job ? DETAIL[job.stage](job) : `Uploading ${formatSize(size)}`;

const LABEL = {
  VALIDATE: "Validate…",
  IMPORT: "Import rows…",
  RUN: "Run rules…",
  DONE: "Import complete",
  FAILED: "Import failed",
} as const;

/** The file being imported: its step, a progress bar and, once done, what it brought. */
export function ImportJobCard({
  job,
  file,
  onAnother,
}: {
  /** Null while the file is still uploading. */
  job: ImportJob | null;
  file: { name: string; size: number };
  onAnother: () => void;
}) {
  const current = stepOf(job);
  const ended = job?.status != null;
  const failed = job?.status === "FAILED";
  const pct = percentOf(job);

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-bg px-[22px] py-5 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex size-10 flex-none items-center justify-center rounded-lg bg-bg-sub font-mono text-[11px] font-bold text-fg-muted">
          CSV
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-mono text-sm font-semibold">{file.name}</span>
          <span className="text-xs text-fg-muted tabular-nums">
            {formatSize(file.size)}
            {job && ` · started ${formatStamp(job.startedAt)}`}
          </span>
        </div>
        {ended && (
          <button
            type="button"
            onClick={onAnother}
            className="h-[30px] cursor-pointer rounded-md border-0 bg-fg px-3.5 text-[13px] font-semibold text-white hover:opacity-90"
          >
            Upload another file
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold">{job ? LABEL[job.stage] : "Upload…"}</span>
          <span className="text-[13px] font-bold tabular-nums">
            {failed ? "Failed" : `${pct} %`}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Import progress"
          className="h-2 overflow-hidden rounded-full bg-border-soft"
        >
          <div
            className={bar({ state: failed ? "failed" : ended ? "done" : "running" })}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-fg-muted tabular-nums">{detailOf(job, file.size)}</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {STAGES.map((label, i) => {
          const state = i < current ? "done" : i === current ? "active" : "idle";
          return (
            <div key={label} className={step({ state })}>
              <span className={stepMark({ state })}>{i + 1}</span>
              <span className={stepLabel({ state })}>{label}</span>
            </div>
          );
        })}
      </div>

      {job && ended && !failed && (
        <dl className="grid grid-cols-4 gap-3 border-t border-border-soft pt-3.5">
          {[
            ["Rows imported", formatCount(job.rowsImported)],
            ["Rejected", formatCount(job.rowsRejected)],
            ["New alerts", formatCount(job.alerts ?? 0)],
            ["Duration", formatDuration(job.startedAt, job.finishedAt)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
                {k}
              </dt>
              <dd className="m-0 text-lg font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
