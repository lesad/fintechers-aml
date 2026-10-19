import { cva } from "class-variance-authority";
import { useState } from "react";
import {
  type Control,
  type UseFormRegister,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";

import { Select } from "@/components";

import { formatCzk, type NewRule, type RuleVersion, saveRule } from "./api";
import { isoHours } from "./format";

import type { ReactNode } from "react";

type FormValues = {
  key: string;
  alertType: string;
  layer: RuleVersion["layer"];
  scopeClientId: string;
  replacesKey: string;
  grain: RuleVersion["grain"];
  anchor: string;
  condition: string;
  params: { name: string; value: string }[];
  variables: {
    name: string;
    agg: RuleVersion["variables"][number]["agg"];
    field: string;
    filter: string;
    kind: "day" | "relative";
    from: string;
    to: string;
  }[];
};

type RuleFormProps = {
  /** The version to start from; null for a brand-new rule. */
  from: RuleVersion | null;
  author: string;
  onSaved: (saved: RuleVersion) => void;
  onCancel: () => void;
};

const input = cva(
  "h-7 rounded border border-border px-2 text-[13px] text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25",
  {
    variants: {
      locked: { true: "bg-bg-sub text-fg-subtle", false: "bg-bg" },
      mono: { true: "font-mono text-xs", false: "" },
      width: { auto: "", wide: "min-w-64 flex-1", hours: "w-16" },
    },
    defaultVariants: { locked: false, mono: false, width: "auto" },
  },
);

const conditionBox = cva(
  "min-h-16 w-full rounded border px-2 py-1.5 font-mono text-xs text-fg outline-none focus:ring-2 focus:ring-purple/25",
  {
    variants: {
      error: { true: "border-high bg-high-bg", false: "border-border bg-bg focus:border-purple" },
    },
  },
);

const hours = (iso: string) => String(isoHours(iso) ?? 0);

const EMPTY: FormValues = {
  key: "",
  alertType: "",
  layer: "company",
  scopeClientId: "",
  replacesKey: "",
  grain: "transaction",
  anchor: "",
  condition: "",
  params: [],
  variables: [],
};

function defaults(from: RuleVersion | null): FormValues {
  if (!from) return EMPTY;
  return {
    key: from.key,
    alertType: from.alertType,
    layer: from.layer,
    scopeClientId: from.scopeClientId ?? "",
    replacesKey: from.replacesKey ?? "",
    grain: from.grain,
    anchor: from.anchor ?? "",
    condition: from.condition,
    params: Object.entries(from.params).map(([name, value]) => ({
      name,
      value: String(value),
    })),
    variables: from.variables.map((v) => ({
      name: v.name,
      agg: v.agg,
      field: v.field,
      filter: v.filter,
      kind: v.window.kind,
      from: v.window.kind === "relative" ? hours(v.window.from) : "0",
      to: v.window.kind === "relative" ? hours(v.window.to) : "0",
    })),
  };
}

function toNewRule(values: FormValues, from: RuleVersion | null, author: string): NewRule {
  return {
    key: values.key.trim(),
    alertType: values.alertType.trim(),
    layer: values.layer,
    scopeSegmentId: from?.scopeSegmentId ?? null,
    scopeClientId: values.layer === "client" ? values.scopeClientId.trim() : null,
    grain: values.grain,
    anchor: values.grain === "client_anchor" ? values.anchor.trim() : null,
    condition: values.condition.trim(),
    replacesKey: values.replacesKey.trim() || null,
    variables: values.variables.map((v) => ({
      name: v.name.trim(),
      agg: v.agg,
      field: v.field.trim(),
      filter: v.filter.trim() || "true",
      window:
        v.kind === "day"
          ? { kind: "day" }
          : { kind: "relative", from: `PT${Number(v.from)}H`, to: `PT${Number(v.to)}H` },
    })),
    params: Object.fromEntries(values.params.map((p) => [p.name.trim(), Number(p.value)])),
    author,
  };
}

type FieldsProps = { control: Control<FormValues>; register: UseFormRegister<FormValues> };

const legend = "mb-1 text-[11px] tracking-[0.04em] text-fg-subtle uppercase";

function ParamFields({ control, register }: FieldsProps) {
  const params = useFieldArray({ control, name: "params" });
  const paramValues = useWatch({ control, name: "params" });
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={legend}>Parameters</legend>
      {params.fields.map((field, i) => {
        const value = Number(paramValues[i]?.value);
        return (
          <div key={field.id} className="flex items-center gap-2">
            <input
              {...register(`params.${i}.name`)}
              aria-label={`Name of parameter ${i + 1}`}
              className={input({ mono: true })}
            />
            <input
              {...register(`params.${i}.value`)}
              aria-label={`Value of parameter ${i + 1}`}
              inputMode="numeric"
              className={input({ mono: true })}
            />
            {Number.isFinite(value) && value > 0 && (
              <span className="text-xs text-fg-subtle">= {formatCzk(value)} if an amount</span>
            )}
            <button
              type="button"
              aria-label={`Remove parameter ${i + 1}`}
              onClick={() => params.remove(i)}
              className="text-fg-subtle hover:text-high"
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => params.append({ name: "", value: "" })}
        className="self-start text-xs text-fg-muted hover:text-fg"
      >
        + parameter
      </button>
    </fieldset>
  );
}

function VariableFields({ control, register }: FieldsProps) {
  const variables = useFieldArray({ control, name: "variables" });
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={legend}>Variables</legend>
      {variables.fields.map((field, i) => (
        <div key={field.id} className="flex flex-wrap items-center gap-2">
          <input
            {...register(`variables.${i}.name`)}
            aria-label={`Name of variable ${i + 1}`}
            className={input({ mono: true })}
          />
          <Select
            {...register(`variables.${i}.agg`)}
            aria-label={`Aggregation of variable ${i + 1}`}
          >
            {["sum", "max", "min", "count", "set"].map((agg) => (
              <option key={agg} value={agg}>
                {agg}
              </option>
            ))}
          </Select>
          <input
            {...register(`variables.${i}.field`)}
            aria-label={`Field of variable ${i + 1}`}
            className={input({ mono: true })}
          />
          <input
            {...register(`variables.${i}.filter`)}
            aria-label={`Filter of variable ${i + 1}`}
            className={input({ mono: true, width: "wide" })}
          />
          <Select {...register(`variables.${i}.kind`)} aria-label={`Window of variable ${i + 1}`}>
            <option value="day">calendar day</option>
            <option value="relative">hours around the anchor</option>
          </Select>
          <input
            {...register(`variables.${i}.from`)}
            aria-label={`Window start of variable ${i + 1} in hours`}
            inputMode="numeric"
            className={input({ mono: true, width: "hours" })}
          />
          <input
            {...register(`variables.${i}.to`)}
            aria-label={`Window end of variable ${i + 1} in hours`}
            inputMode="numeric"
            className={input({ mono: true, width: "hours" })}
          />
          <button
            type="button"
            aria-label={`Remove variable ${i + 1}`}
            onClick={() => variables.remove(i)}
            className="text-fg-subtle hover:text-high"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          variables.append({
            name: "",
            agg: "sum",
            field: "amount",
            filter: "true",
            kind: "day",
            from: "0",
            to: "0",
          })
        }
        className="self-start text-xs text-fg-muted hover:text-fg"
      >
        + variable
      </button>
    </fieldset>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] text-fg-subtle">
      {label}
      {children}
    </label>
  );
}

export function RuleForm({ from, author, onSaved, onCancel }: RuleFormProps) {
  const locked = from !== null;
  const { register, handleSubmit, control } = useForm<FormValues>({
    defaultValues: defaults(from),
  });
  const grain = useWatch({ control, name: "grain" });
  const layer = useWatch({ control, name: "layer" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = handleSubmit(async (values) => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveRule(toNewRule(values, from, author)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  });

  return (
    <form
      aria-label={from ? `New version of ${from.key}` : "New rule"}
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-3"
    >
      <h2 className="text-sm font-semibold">
        {from ? (
          <>
            <span className="font-mono">{from.key}</span> · new version{" "}
            <span className="text-xs font-normal text-fg-subtle">from v{from.version}</span>
          </>
        ) : (
          "New rule"
        )}
      </h2>

      <div className="flex flex-wrap gap-2.5">
        <Labelled label="Key">
          <input {...register("key")} readOnly={locked} className={input({ locked, mono: true })} />
        </Labelled>
        <Labelled label="Alert type">
          <input {...register("alertType")} readOnly={locked} className={input({ locked })} />
        </Labelled>
        <Labelled label="Layer">
          {locked ? (
            <input
              value={from.layer === "segment" ? `segment ${from.scopeSegmentId}` : from.layer}
              readOnly
              className={input({ locked })}
            />
          ) : (
            <Select {...register("layer")}>
              <option value="company">company</option>
              <option value="client">client</option>
            </Select>
          )}
        </Labelled>
        {layer === "client" && (
          <Labelled label="Client">
            <input
              {...register("scopeClientId")}
              readOnly={locked}
              className={input({ locked, mono: true })}
            />
          </Labelled>
        )}
        <Labelled label="Replaces">
          <input
            {...register("replacesKey")}
            readOnly={locked}
            className={input({ locked, mono: true })}
          />
        </Labelled>
        <Labelled label="Evaluated per">
          <Select {...register("grain")}>
            <option value="transaction">transaction</option>
            <option value="client_day">client day</option>
            <option value="client_anchor">client anchor</option>
          </Select>
        </Labelled>
      </div>

      {grain === "client_anchor" && (
        <Labelled label="Anchor">
          <input {...register("anchor")} className={input({ mono: true })} />
        </Labelled>
      )}

      <Labelled label="Condition">
        <textarea {...register("condition")} className={conditionBox({ error: error !== null })} />
      </Labelled>
      {error && (
        <p role="alert" className="-mt-2 font-mono text-xs whitespace-pre-wrap text-high">
          {error}
        </p>
      )}

      <ParamFields control={control} register={register} />
      <VariableFields control={control} register={register} />

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-indigo px-3 py-1.5 text-xs text-white disabled:opacity-70"
        >
          {saving ? "Writing explanation…" : "Save as draft"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-3 py-1.5 text-xs text-fg-muted"
        >
          Cancel
        </button>
        <span className="text-xs text-fg-subtle">Saved as {author} · drafts don't affect runs</span>
      </div>
    </form>
  );
}
