import { type RiskLevel, riskDot } from "@/components";
import { cn } from "@/utils";

import { parseBacktestTab, SETTINGS_TAB } from "./use-app-routes";

import type { TabProgress } from "./use-backtest-progress";

const icon = "size-3 flex-none";

/** The small cog of the settings tab, as in the header. */
function CogIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={icon}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** A circular arrow back in time, for a backtest. */
function ReplayIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={icon}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

/** In place of a backtest's icon: a spinner while it runs, a check once it finished and the tab was not looked at. */
function ProgressIcon({ progress }: { progress: TabProgress | undefined }) {
  if (progress === "running")
    return (
      <>
        <span
          aria-hidden="true"
          className="size-3 flex-none animate-spin rounded-full border-2 border-border border-t-purple motion-reduce:animate-none"
        />
        <span className="sr-only">running,</span>
      </>
    );
  if (progress === "done")
    return (
      <>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={cn(icon, "text-low")}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="sr-only">finished,</span>
      </>
    );
  return <ReplayIcon />;
}

/** What a closable tab shows: a transaction with its rating, the settings, or a backtest. */
export function TabLabel({
  id,
  level,
  backtest,
  progress,
}: {
  id: string;
  /** A transaction's rule rating, once the queue knows it. */
  level: RiskLevel | undefined;
  /** A backtest's rule and version, e.g. "B2 v2", when known. */
  backtest: string | undefined;
  /** A backtest tab's progress, when it is running or finished unseen. */
  progress?: TabProgress;
}) {
  if (id === SETTINGS_TAB)
    return (
      <>
        <CogIcon />
        <span className="text-xs font-semibold">Settings</span>
      </>
    );
  const bt = parseBacktestTab(id);
  if (bt)
    return (
      <>
        <ProgressIcon progress={progress} />
        <span className="text-xs whitespace-nowrap">
          <span className="font-semibold">Backtest</span>
          {backtest && <span className="font-mono"> · {backtest}</span>}
        </span>
      </>
    );
  return (
    <>
      {level && <span className={cn("size-[7px] flex-none rounded-[2px]", riskDot({ level }))} />}
      <span className="font-mono text-xs">{id}</span>
    </>
  );
}
