import { cva } from "class-variance-authority";
import { useState } from "react";

import { Modal } from "@/components";

import { runBacktest, type RuleVersion } from "./api";
import { periodDays } from "./format";

// shortcut: the organisers' data covers July 2026 only, so the periods offered are within it; read the range
// from the engine once data from other months can be imported.
const DATA_FROM = "2026-07-01";
const DATA_TO = "2026-07-31";

const PRESETS = [
  { key: "month", label: "Whole July", from: DATA_FROM },
  { key: "week", label: "Last 7 days", from: "2026-07-25" },
  { key: "custom", label: "Custom", from: null },
] as const;

type Preset = (typeof PRESETS)[number]["key"];

const presetButton = cva(
  "h-7 cursor-pointer rounded-md border-0 px-2.5 text-xs font-semibold text-fg",
  {
    variants: {
      on: {
        true: "bg-bg shadow-[0_1px_2px_rgba(37,39,70,.12),0_0_0_1px_var(--color-border)]",
        false: "bg-transparent hover:bg-bg",
      },
    },
  },
);

const dateInput =
  "h-8 rounded border border-border px-2 text-[13px] text-fg tabular-nums outline-none focus:border-purple";

/** Picks the period to replay a draft over and starts the backtest in the engine; its results open in a tab. */
export function BacktestDialog({
  draft,
  active,
  onStarted,
  onClose,
}: {
  draft: RuleVersion;
  /** The version the draft would replace, if any. */
  active: RuleVersion | undefined;
  onStarted: () => void;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState<string>(DATA_FROM);
  const [to, setTo] = useState<string>(DATA_TO);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const error = !from || !to ? "Pick both dates" : from > to ? "Start is after end" : null;
  const n = error ? 0 : periodDays(from, to);

  return (
    <Modal
      label={`Backtest ${draft.key} v${draft.version}`}
      onClose={onClose}
      className="max-w-[480px]"
      header={
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-base font-bold">
            Backtest {draft.key} v{draft.version}
          </h2>
          <p className="m-0 text-[13px] text-pretty text-fg-muted">
            {active
              ? `Replays the transactions from the period with v${draft.version} in place of v${active.version}.`
              : `Replays the transactions from the period with v${draft.version} added.`}{" "}
            Results open in a new tab; no cases are created.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-[18px] py-4">
        <span className="text-xs font-semibold">Period</span>
        <div
          role="group"
          aria-label="Period"
          className="flex gap-1 self-start rounded-md bg-bg-sub p-0.5"
        >
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={preset === p.key}
              onClick={() => {
                setPreset(p.key);
                if (p.from) {
                  setFrom(p.from);
                  setTo(DATA_TO);
                }
              }}
              className={presetButton({ on: preset === p.key })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="From"
            value={from}
            min={DATA_FROM}
            max={to || DATA_TO}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
            className={dateInput}
          />
          <span className="text-fg-subtle">→</span>
          <input
            type="date"
            aria-label="To"
            value={to}
            min={from || DATA_FROM}
            max={DATA_TO}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
            className={dateInput}
          />
          <span className={error ? "text-xs text-med" : "text-xs text-fg-subtle"}>
            {error ?? `${n} ${n === 1 ? "day" : "days"}`}
          </span>
        </div>
        <span className="text-xs text-fg-subtle">
          The data covers July 2026. Replaying the whole month takes about a minute.
        </span>
        {failure && (
          <span role="alert" className="text-xs text-high">
            {failure}
          </span>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-8 cursor-pointer rounded-md border border-border bg-transparent px-3.5 text-[13px] font-semibold text-fg hover:border-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={error !== null || busy}
            onClick={() => {
              setBusy(true);
              setFailure(null);
              runBacktest(draft.id, { from, to })
                .then(onStarted)
                .catch((err: unknown) => {
                  setFailure(err instanceof Error ? err.message : String(err));
                  setBusy(false);
                });
            }}
            className="h-8 cursor-pointer rounded-md border-0 bg-fg px-3.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Run backtest →
          </button>
        </div>
      </div>
    </Modal>
  );
}
