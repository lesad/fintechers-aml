import { cva } from "class-variance-authority";
import { useEffect, useRef, useState } from "react";

import { Toast } from "@/components";

import { fetchImport, fetchImports, type ImportJob, uploadTransactions } from "./api";
import { ImportHistory } from "./ImportHistory";
import { ImportJobCard } from "./ImportJobCard";
import { ResetData } from "./ResetData";

/** The file on screen: uploading (no job yet), running or finished. */
type Current = { file: { name: string; size: number }; job: ImportJob | null };

const dropZone = cva(
  "flex min-h-[280px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
  {
    variants: {
      drag: {
        true: "border-purple bg-ai-from",
        false: "border-border bg-bg hover:border-fg",
      },
    },
  },
);

const POLL_MS = 1000;

/**
 * Data import, for test environments: upload a ČNB transactions CSV, follow it through validation, the row
 * import and the rule run, and see past imports. `onDataChanged` lets the review queue reload afterwards.
 */
export function ImportPage({ onDataChanged }: { onDataChanged: () => void }) {
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const loadHistory = () =>
    fetchImports()
      .then((jobs) => {
        setHistory(jobs);
        return jobs;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        return [];
      });

  // On open: the history, and a job still running from before (another tab, a reload) to follow.
  useEffect(() => {
    void loadHistory().then((jobs) => {
      const running = jobs.find((j) => j.status === null);
      if (running)
        setCurrent(
          (c) => c ?? { file: { name: running.fileName, size: running.fileSize }, job: running },
        );
    });
    // Loads once on open; `loadHistory` only wraps setters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow a running job until it ends, then refresh the history and tell the queue.
  const runningId = current?.job && current.job.status === null ? current.job.id : null;
  useEffect(() => {
    if (runningId === null) return;
    const timer = setInterval(() => {
      fetchImport(runningId)
        .then((job) => {
          setCurrent((c) => (c ? { ...c, job } : c));
          if (job.status !== null) {
            void loadHistory();
            onDataChanged();
          }
        })
        .catch(() => {
          // A missed poll is retried on the next tick.
        });
    }, POLL_MS);
    return () => clearInterval(timer);
    // Polls per running job; `loadHistory` and `onDataChanged` are stable in effect.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [runningId]);

  const start = (file: File | undefined) => {
    if (!file) return;
    setDrag(false);
    setError(null);
    setCurrent({ file: { name: file.name, size: file.size }, job: null });
    uploadTransactions(file)
      .then((job) => setCurrent((c) => (c ? { ...c, job } : c)))
      .catch((err: unknown) => {
        setCurrent(null);
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-bg-sub">
      <div className="mx-auto flex max-w-[980px] flex-col gap-5 px-6 pt-6 pb-12">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-xl font-bold tracking-[-0.01em]">Data import</h1>
          <span className="text-[13px] text-fg-muted">
            Upload a transactions file. We validate it, load the rows and run the active rules over
            the data.
          </span>
        </div>

        {current ? (
          <ImportJobCard job={current.job} file={current.file} onAnother={() => setCurrent(null)} />
        ) : (
          <button
            type="button"
            aria-label="Upload a transactions file"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              start(e.dataTransfer.files[0]);
            }}
            className={dropZone({ drag })}
          >
            <div className="flex size-14 items-center justify-center rounded-xl bg-fg text-yellow">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-[26px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <span className="text-base font-bold">
              {drag ? "Release to upload" : "Drop a transactions file here"}
            </span>
            <span className="text-[13px] text-fg-muted">
              or{" "}
              <span className="font-semibold text-fg underline underline-offset-[0.2em]">
                choose a file
              </span>{" "}
              from your computer
            </span>
            <span className="text-xs text-fg-subtle">
              CSV in the ČNB format (semicolon-separated): transaction ID, client ID, date, time,
              volume, currency, countries and accounts of payer and payee, type of transaction.
              Clients must already exist; a known transaction ID is overwritten.
            </span>
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept=".csv"
          aria-label="Transactions file"
          onChange={(e) => {
            start(e.target.files?.[0]);
            // Clear the choice, so picking the same file again still starts an import.
            if (input.current) input.current.value = "";
          }}
          className="hidden"
        />

        {error && (
          <div role="alert" className="rounded-lg bg-high-bg px-3.5 py-2.5 text-[13px] text-high">
            {error}
          </div>
        )}
        <ImportHistory jobs={history} />

        <ResetData
          onDeleted={() => {
            setToast("Transactions deleted. The queue is empty until the next import.");
            onDataChanged();
          }}
        />
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </main>
  );
}
