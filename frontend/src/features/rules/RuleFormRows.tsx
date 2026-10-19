import { cva } from "class-variance-authority";

import { Select } from "@/components";
import { cn } from "@/utils";

import { PARAM_UNITS, type RuleVariable } from "./api";
import { addButton, field, removeButton } from "./form-parts";
import { newVariable } from "./rule-draft";

import type { DraftParam, DraftVariable } from "./rule-draft";

const UNIT_LABEL: Record<(typeof PARAM_UNITS)[number], string> = {
  amount: "CZK",
  percent: "%",
  multiple: "×",
  count: "count",
};

const AGGS: RuleVariable["agg"][] = ["sum", "count", "set", "max", "min"];

const paramRow = cva(
  "grid grid-cols-[minmax(0,1fr)_160px_96px_28px] items-center gap-1.5 rounded-md px-1.5 py-1",
  { variants: { changed: { true: "bg-sel", false: "bg-bg-sub" } } },
);

const variableRow = cva("flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2", {
  variants: { changed: { true: "bg-sel", false: "bg-bg" } },
});

type RowsProps<T> = {
  rows: T[];
  /** The same rows in the version the draft starts from; a row that differs from it is highlighted. */
  base: T[];
  onChange: (rows: T[]) => void;
};

const differs = <T extends { name: string }>(row: T, base: T[]) => {
  const before = base.find((b) => b.name === row.name);
  return !before || JSON.stringify(before) !== JSON.stringify(row);
};

const patch = <T,>(rows: T[], i: number, change: Partial<T>) =>
  rows.map((row, j) => (j === i ? { ...row, ...change } : row));

export function ParamRows({ rows, base, onChange }: RowsProps<DraftParam>) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((p, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- rows have no id; a name is still being typed, so the position is their identity
        <div key={i} className={paramRow({ changed: base.length > 0 && differs(p, base) })}>
          <input
            value={p.name}
            onChange={(e) => onChange(patch(rows, i, { name: e.target.value.replace(/\s/g, "") }))}
            placeholder="name"
            aria-label={`Name of parameter ${i + 1}`}
            className={field({ mono: true })}
          />
          <input
            value={p.value}
            onChange={(e) => onChange(patch(rows, i, { value: e.target.value }))}
            placeholder="value"
            inputMode="decimal"
            aria-label={`Value of parameter ${i + 1}`}
            className={field({ mono: true, align: "right" })}
          />
          <Select
            value={p.unit}
            // NOTE: a select only yields the option values rendered below, so the cast holds.
            onChange={(e) =>
              onChange(patch(rows, i, { unit: e.target.value as DraftParam["unit"] }))
            }
            aria-label={`Unit of parameter ${i + 1}`}
          >
            <option value="">unit…</option>
            {PARAM_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABEL[unit]}
              </option>
            ))}
          </Select>
          <button
            type="button"
            aria-label={`Remove parameter ${i + 1}`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className={removeButton}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { name: "", value: "", unit: "" }])}
        className={addButton}
      >
        + Add parameter
      </button>
    </div>
  );
}

export function VariableRows({ rows, base, onChange }: RowsProps<DraftVariable>) {
  return (
    <>
      {rows.map((x, i) => {
        const set = (change: Partial<DraftVariable>) => onChange(patch(rows, i, change));
        const n = i + 1;
        return (
          // oxlint-disable-next-line react/no-array-index-key -- rows have no id; a name is still being typed, so the position is their identity
          <div key={i} className={variableRow({ changed: base.length > 0 && differs(x, base) })}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={x.name}
                onChange={(e) => set({ name: e.target.value.replace(/\s/g, "") })}
                placeholder="name"
                aria-label={`Name of variable ${n}`}
                className={cn(field({ mono: true }), "w-40 font-bold text-ai-fg")}
              />
              <span className="text-fg-subtle">=</span>
              {/* NOTE: a select only yields the option values it renders, so the casts below hold. */}
              <Select
                value={x.agg}
                onChange={(e) => set({ agg: e.target.value as DraftVariable["agg"] })}
                aria-label={`Aggregation of variable ${n}`}
              >
                {AGGS.map((agg) => (
                  <option key={agg} value={agg}>
                    {agg}
                  </option>
                ))}
              </Select>
              <span className="text-fg-subtle">of</span>
              <input
                value={x.field}
                onChange={(e) => set({ field: e.target.value })}
                placeholder="amount"
                aria-label={`Field of variable ${n}`}
                className={cn(field({ mono: true }), "w-[150px]")}
              />
              <span className="flex-1" />
              <button
                type="button"
                aria-label={`Remove variable ${n}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className={removeButton}
              >
                ×
              </button>
            </div>
            <label className="flex items-center gap-2 text-fg-subtle">
              where
              <input
                value={x.filter}
                onChange={(e) => set({ filter: e.target.value })}
                placeholder="true"
                aria-label={`Filter of variable ${n}`}
                className={cn(field({ mono: true }), "min-w-0 flex-1")}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-fg-subtle">
              window
              <Select
                value={x.kind}
                onChange={(e) => set({ kind: e.target.value as DraftVariable["kind"] })}
                aria-label={`Window of variable ${n}`}
              >
                <option value="day">day</option>
                <option value="relative">relative</option>
              </Select>
              {x.kind === "relative" && (
                <>
                  <span className="flex items-center gap-1.5">
                    from
                    <input
                      value={x.from}
                      onChange={(e) => set({ from: e.target.value })}
                      inputMode="numeric"
                      aria-label={`From hour of variable ${n}`}
                      className={cn(field({ mono: true }), "w-[76px] text-right")}
                    />
                    h to
                    <input
                      value={x.to}
                      onChange={(e) => set({ to: e.target.value })}
                      inputMode="numeric"
                      aria-label={`To hour of variable ${n}`}
                      className={cn(field({ mono: true }), "w-[76px] text-right")}
                    />
                    h
                  </span>
                  <span className="text-xs">relative to the anchor transaction</span>
                </>
              )}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...rows, newVariable()])}
        className={addButton}
      >
        + Add variable
      </button>
    </>
  );
}
