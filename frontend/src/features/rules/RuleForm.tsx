import { cva } from "class-variance-authority";
import { useState } from "react";

import { ConditionLegend, conditionToken } from "@/components";
import { cn } from "@/utils";

import { type RuleVersion, saveRule, updateRule } from "./api";
import { ExplanationPreview } from "./ExplanationPreview";
import { ChangedBadge, field, Issues, SectionTitle, Segmented } from "./form-parts";
import { conditionTokens, grainLabel } from "./format";
import {
  changedSections,
  type Draft,
  draftFrom,
  draftIssues,
  editedFields,
  type DraftSection,
  type Issue,
  toNewRule,
  unknownNames,
} from "./rule-draft";
import { ParamRows, VariableRows } from "./RuleFormRows";

import type { ReactNode } from "react";

type RuleFormProps = {
  /** The version to start from; null for a brand-new rule. */
  from: RuleVersion | null;
  /** Overwrite [from], a draft, instead of saving a new version. */
  edit?: boolean;
  author: string;
  /** The version number the draft will get. */
  nextVersion: number;
  /** Keys already taken, so a new rule cannot reuse one. */
  existingKeys: string[];
  onSaved: (saved: RuleVersion) => void;
  onCancel: () => void;
};

const ALERT_TYPES = [
  ["A", "A"],
  ["B", "B"],
  ["C", "C"],
] as const;

const GRAINS = (["client_day", "transaction", "client_anchor"] as const).map(
  (g) => [g, grainLabel[g]] as const,
);

const status = cva("flex items-center gap-2 font-semibold", {
  variants: { tone: { error: "text-med", idle: "text-fg-subtle", ready: "text-low" } },
});

const statusDot = cva("size-2 rounded-full", {
  variants: { tone: { error: "bg-med", idle: "bg-fg-subtle", ready: "bg-low" } },
});

const label = "flex flex-col gap-1.5 text-xs font-semibold text-fg-muted";
const section = "flex flex-col gap-1.5";

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

type Status = { tone: "error" | "idle" | "ready"; text: string };

type Counts = { shown: number; hidden: number; changed: number };

function statusOf({ shown, hidden, changed }: Counts, base: number | null): Status {
  if (shown) return { tone: "error", text: `${plural(shown, "issue")} to fix` };
  if (hidden) return { tone: "idle", text: "Fill in the required fields" };
  if (base !== null && !changed) return { tone: "idle", text: `No changes from v${base} yet` };
  if (base === null) return { tone: "ready", text: "Ready to save" };
  return { tone: "ready", text: `${plural(changed, "section")} changed · ready to save` };
}

export function RuleForm({
  from,
  edit = false,
  author,
  nextVersion,
  existingKeys,
  onSaved,
  onCancel,
}: RuleFormProps) {
  const [base] = useState(() => (from ? draftFrom(from) : null));
  const [draft, setDraft] = useState(() => draftFrom(from));
  const [saving, setSaving] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

  const baseVersion = from?.version ?? null;
  const all = draftIssues(draft, from === null, new Set(existingKeys));
  const issues = all.filter((i) => !i.field || touched.has(i.field));
  const errors = all.filter((i) => i.level === "error").length;
  const shown = issues.filter((i) => i.level === "error").length;
  const changed = base ? changedSections(draft, base) : new Set<DraftSection>();

  const set = (change: Partial<Draft>) => {
    const next = { ...draft, ...change };
    setTouched((t) => new Set([...t, ...editedFields(draft, next)]));
    setDraft(next);
  };
  const fix = (issue: Issue) => issue.fix && setDraft(issue.fix.apply);
  const of = (s: Issue["section"]) => issues.filter((i) => i.section === s);
  const badge = (s: DraftSection) => <ChangedBadge show={changed.has(s)} base={baseVersion} />;

  const save = async () => {
    setSaving(true);
    setRejected(null);
    try {
      const body = toNewRule(draft, from, author);
      onSaved(await (edit && from ? updateRule(from.id, body) : saveRule(body)));
    } catch (err) {
      setRejected(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex w-full max-w-[1040px] flex-1 flex-col gap-[18px] px-6 pt-4 pb-6">
        <Heading from={from} edit={edit} nextVersion={nextVersion} />
        <Identity draft={draft} set={set} isNew={from === null} nameBadge={badge("name")}>
          <Issues issues={of("identity")} onFix={fix} />
        </Identity>
        <Evaluated draft={draft} set={set} badge={badge("grain")} />

        <section className={section}>
          <SectionTitle title="Condition">{badge("condition")}</SectionTitle>
          <ConditionEditor draft={draft} onChange={(condition) => set({ condition })} />
          <ConditionLegend withUnknown />
          <Issues issues={of("condition")} onFix={fix} />
          {rejected && (
            <pre
              role="alert"
              className="rounded border border-high bg-high-bg px-3 py-2 font-mono text-xs whitespace-pre-wrap text-high"
            >
              {rejected}
            </pre>
          )}
        </section>

        <section className={section}>
          <SectionTitle title="Parameters" hint="Referenced as p.name">
            {badge("params")}
          </SectionTitle>
          <ParamRows
            rows={draft.params}
            base={base?.params ?? []}
            onChange={(params) => set({ params })}
          />
          <Issues issues={of("params")} onFix={fix} />
        </section>

        <section className={section}>
          <SectionTitle title="Variables" hint="Aggregates over the client’s transactions">
            {badge("variables")}
          </SectionTitle>
          <VariableRows
            rows={draft.variables}
            base={base?.variables ?? []}
            onChange={(variables) => set({ variables })}
          />
          <Issues issues={of("variables")} onFix={fix} />
        </section>

        <section className={section}>
          <SectionTitle title="What it flags" hint="Plain language, shown to reviewers" />
          <ExplanationPreview rule={toNewRule(draft, from, author)} blocked={errors > 0} />
        </section>
      </div>

      <Footer
        status={statusOf({ shown, hidden: errors - shown, changed: changed.size }, baseVersion)}
        saving={saving}
        disabled={saving || errors > 0 || (base !== null && changed.size === 0)}
        saveLabel={edit && from ? `Save draft v${from.version}` : `Save as draft v${nextVersion}`}
        onCancel={onCancel}
        onSave={save}
      />
    </div>
  );
}

type HeadingProps = { from: RuleVersion | null; edit: boolean; nextVersion: number };

function Heading({ from, edit, nextVersion }: HeadingProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-fg-subtle">
        {from
          ? edit
            ? `${from.key} · saving overwrites draft v${from.version}`
            : `${from.key} · based on v${from.version} ${from.status}`
          : "New rule · saved as draft v1"}
      </div>
      <h1 className="text-lg leading-tight font-semibold">
        {from
          ? edit
            ? `${from.key} · edit draft v${from.version}`
            : `${from.key} · new version v${nextVersion}`
          : "New rule"}
      </h1>
    </div>
  );
}

type SectionProps = { draft: Draft; set: (change: Partial<Draft>) => void };

type IdentityProps = SectionProps & { isNew: boolean; nameBadge: ReactNode; children: ReactNode };

function Identity({ draft, set, isNew, nameBadge, children }: IdentityProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-4">
        {isNew && (
          <label className={label}>
            Rule code
            <input
              value={draft.key}
              onChange={(e) => set({ key: e.target.value.toUpperCase() })}
              placeholder="e.g. C2"
              className={cn(field({ mono: true }), "w-[110px] font-bold")}
            />
          </label>
        )}
        <div className={label}>
          Alert type
          <Segmented
            label="Alert type"
            options={ALERT_TYPES}
            value={draft.alertType}
            onChange={(alertType) => set({ alertType })}
            disabled={!isNew}
          />
        </div>
      </div>
      <label className={label}>
        <span className="flex items-center gap-2">Name {nameBadge}</span>
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Short description of the pattern"
          className={cn(field(), "w-full font-normal")}
        />
      </label>
      {children}
    </section>
  );
}

function Evaluated({ draft, set, badge }: SectionProps & { badge: ReactNode }) {
  return (
    <section className={section}>
      <SectionTitle title="Evaluated">{badge}</SectionTitle>
      <Segmented
        label="Evaluated"
        options={GRAINS}
        value={draft.grain}
        onChange={(grain) => set({ grain })}
      />
      {draft.grain === "client_anchor" && (
        <label className="flex flex-wrap items-center gap-2.5 text-fg-muted">
          at each transaction where
          <input
            value={draft.anchor}
            onChange={(e) => set({ anchor: e.target.value })}
            placeholder='tx.direction == "in"'
            aria-label="Anchor"
            className={cn(field({ mono: true }), "min-w-60 flex-1")}
          />
        </label>
      )}
    </section>
  );
}

type FooterProps = {
  status: Status;
  saving: boolean;
  disabled: boolean;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
};

function Footer({ status: s, saving, disabled, saveLabel, onCancel, onSave }: FooterProps) {
  return (
    <div className="sticky bottom-0 flex flex-none flex-wrap items-center gap-3 border-t border-border bg-bg/90 px-6 py-2 backdrop-blur-md">
      <span className={status({ tone: s.tone })}>
        <span aria-hidden="true" className={statusDot({ tone: s.tone })} />
        {s.text}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onCancel}
        className="h-7 rounded px-3 text-[13px] font-semibold text-fg-muted hover:bg-hover hover:text-fg"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="h-7 rounded bg-indigo px-3.5 text-[13px] font-semibold text-white hover:bg-indigo-hover disabled:cursor-not-allowed disabled:bg-retired-dot"
      >
        {saving ? "Writing explanation…" : saveLabel}
      </button>
    </div>
  );
}

function ConditionEditor({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (condition: string) => void;
}) {
  const variables = new Set(draft.variables.map((x) => x.name.trim()).filter(Boolean));
  const params = new Set(draft.params.map((p) => p.name.trim()));
  const unknown = new Set(unknownNames(draft));
  return (
    <div className="relative rounded-md bg-indigo">
      <pre
        aria-hidden="true"
        className="min-h-[60px] px-3 py-2.5 font-mono text-[13px] leading-[1.55] break-words whitespace-pre-wrap"
      >
        {conditionTokens(draft.condition, variables).map((t) => (
          <span
            key={t.at}
            className={conditionToken({
              kind: t.kind,
              unknown: unknown.has(t.text) || (t.kind === "param" && !params.has(t.text.slice(2))),
            })}
          >
            {t.text}
          </span>
        ))}
        {"\n "}
      </pre>
      <textarea
        value={draft.condition}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="e.g. tx.amount > p.min_amount"
        aria-label="Condition"
        className="absolute inset-0 size-full resize-none overflow-hidden rounded-md bg-transparent px-3 py-2.5 font-mono text-[13px] leading-[1.55] break-words whitespace-pre-wrap text-transparent caret-yellow outline-none placeholder:text-indigo-60 focus:ring-2 focus:ring-yellow"
      />
    </div>
  );
}
