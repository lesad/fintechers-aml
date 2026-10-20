import { useEffect, useRef, useState } from "react";

import { fetchImport, fetchImports } from "@/features/data-import";

import type { ToastMessage } from "./use-backtest-progress";

/** How often a running recalculation is asked about. */
const POLL_MS = 2000;

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Follows the alert recalculation the engine starts in the background once a rule version is approved (a job in the
 * import history named after the version), says how it ended, and then [onDone] reloads what shows alerts.
 */
export function useRecalculation(notify: (toast: ToastMessage) => void, onDone: () => void) {
  const [rule, setRule] = useState<string | null>(null);
  // The latest callbacks, so new ones from the parent do not restart the following.
  const callbacks = useRef({ notify, onDone });
  useEffect(() => {
    callbacks.current = { notify, onDone };
  });

  useEffect(() => {
    if (rule === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = (message: string) => {
      if (stopped) return;
      setRule(null);
      callbacks.current.notify({ message });
      callbacks.current.onDone();
    };
    const follow = (id: number) =>
      fetchImport(id).then(
        (job) => {
          if (stopped) return;
          if (job.status === null) {
            timer = setTimeout(() => void follow(id), POLL_MS);
            return;
          }
          end(
            job.status === "FAILED"
              ? `Recalculating the alerts after ${rule} failed: ${job.note ?? "unknown error"}`
              : `Alerts recalculated with ${rule}: ${(job.alerts ?? 0).toLocaleString("en-US")} new`,
          );
        },
        (err: unknown) => end(`Could not follow the recalculation: ${reason(err)}`),
      );
    // The engine records the job before it answers the approval, so the newest job for the version is this one.
    fetchImports().then(
      (jobs) => {
        const job = jobs.find((j) => j.rule === rule);
        if (job) void follow(job.id);
        else end(`The engine started no recalculation after ${rule}`);
      },
      (err: unknown) => end(`Could not follow the recalculation: ${reason(err)}`),
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [rule]);

  return {
    /** The approved version, e.g. "B2 v3", whose recalculation to follow. */
    start: (approved: string) => {
      setRule(approved);
      callbacks.current.notify({
        message: `${approved} approved. Recalculating the alerts in the background…`,
        link: { to: "/import", label: "History" },
      });
    },
  };
}
