import { useState } from "react";

import { Modal } from "@/components";

import { type DataCounts, deleteTransactions, fetchCounts } from "./api";
import { formatCount } from "./format";

/** "Delete all data": every transaction and its alerts, after typing DELETE. Clients, rules and users stay. */
export function ResetData({ onDeleted }: { onDeleted: () => void }) {
  const [counts, setCounts] = useState<DataCounts | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setConfirm("");
    setError(null);
    setCounts(null);
    setOpen(true);
    fetchCounts()
      .then(setCounts)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const remove = () => {
    setBusy(true);
    setError(null);
    deleteTransactions()
      .then(() => {
        setOpen(false);
        onDeleted();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-lg bg-bg p-4 shadow-[inset_0_0_0_1px_var(--color-high-bg)]">
      <div className="flex min-w-[260px] flex-1 flex-col gap-0.5">
        <span className="text-sm font-bold">Reset application</span>
        <span className="text-[13px] text-fg-muted">
          Deletes all transactions and their alerts, with the decisions on them. Clients, rules,
          users and the import history are kept. Use only in test environments.
        </span>
      </div>
      <button
        type="button"
        onClick={openDialog}
        className="h-8 flex-none cursor-pointer rounded-md border border-high-dot bg-transparent px-3.5 text-[13px] font-bold text-high hover:bg-high-bg"
      >
        Delete all data
      </button>

      {open && (
        <Modal
          label="Delete all data"
          onClose={() => setOpen(false)}
          className="max-w-[460px]"
          header={<span className="text-base font-bold">Delete all transactions?</span>}
        >
          <div className="flex flex-col gap-3.5 px-5 pt-3 pb-5">
            <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md bg-bg-sub px-3 py-2.5 text-[13px]">
              <dt className="text-fg-muted">Transactions</dt>
              <dd className="m-0 text-right font-semibold tabular-nums">
                {counts ? formatCount(counts.transactions) : "…"}
              </dd>
              <dt className="text-fg-muted">Alerts and their decisions</dt>
              <dd className="m-0 text-right font-semibold tabular-nums">
                {counts ? formatCount(counts.alerts) : "…"}
              </dd>
            </dl>
            <span className="text-[13px] text-pretty text-fg-muted">
              This cannot be undone. The queue stays empty until the next import.
            </span>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold">
                Type <span className="font-mono">DELETE</span> to confirm
              </span>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="DELETE"
                className="h-8 rounded border border-border px-2.5 font-mono text-[13px] text-fg outline-none focus:border-high-dot focus:ring-2 focus:ring-high-bg"
              />
            </label>
            {error && (
              <span role="alert" className="text-xs text-high">
                {error}
              </span>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 cursor-pointer rounded-md border border-border bg-transparent px-3.5 text-[13px] font-semibold text-fg hover:border-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirm !== "DELETE" || busy}
                onClick={remove}
                className="h-8 cursor-pointer rounded-md border-0 bg-high-dot px-3.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete all data
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
