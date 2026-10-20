import { cva } from "class-variance-authority";
import { Fragment } from "react";

import { Toast } from "@/components";

import { bandPill, BandLegend } from "./BandLegend";
import { BAND_OUTCOME, bandOf, listKeys } from "./bands";
import { ScoreSlider } from "./ScoreSlider";
import { useTriageConfig } from "./use-triage-config";

import type { Band, ScoredRuleVersion, TriageConfigVersion } from "./api";

type TriageScoringPageProps = {
  /** The signed-in user, recorded as the author of every score change. */
  author: string;
};

const button = "rounded border border-border bg-bg px-2.5 py-1 text-xs text-fg hover:bg-hover";

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/**
 * The design lays a row out as a CSS grid — `44px minmax(0,1fr) 340px 52px 132px 28px`, 16px gaps, 14px side
 * padding. We keep a real `<table>`, because the header genuinely labels the columns and the native row/column
 * header semantics beat re-declaring them with ARIA. The widths below are those columns plus the padding that
 * stands in for the gaps: 8px each side between columns, 14px at the two edges.
 */
const COL = {
  rule: "w-[66px] pr-2 pl-[14px]",
  name: "px-2",
  slider: "w-[356px] px-2",
  score: "w-[68px] px-2 text-right",
  pill: "w-[148px] px-2",
  revert: "w-[50px] pr-[14px] pl-2",
} as const;

/**
 * A changed row: the selection yellow behind an inset yellow edge. An inset shadow rather than a border, exactly
 * as the design has it, so marking a row costs no layout and cannot shift anything. `h-[52px]` is the design's
 * `min-height:52px` — it is what keeps the row the same height once the "was" line appears inside it.
 */
const scoreRow = cva("h-[52px] data-[saving]:opacity-60", {
  variants: { dirty: { true: "bg-sel shadow-[inset_3px_0_0_var(--color-yellow)]" } },
});

const scoreNumber = cva("font-mono text-[15px] leading-[1.2] font-bold", {
  variants: { scored: { true: "text-fg", false: "text-fg-subtle" } },
});

const footerStatus = cva("flex items-center gap-2 font-semibold", {
  variants: { tone: { draft: "text-draft-fg", saved: "text-low", idle: "text-fg-subtle" } },
});

const footerDot = cva("size-2 flex-none rounded-full", {
  variants: { tone: { draft: "bg-draft-dot", saved: "bg-low-dot", idle: "bg-retired-dot" } },
});

const saveButton = cva(
  "h-7 rounded px-3.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed",
  { variants: { dirty: { true: "bg-indigo hover:bg-indigo-hover", false: "bg-retired-dot" } } },
);

/** One row of the table: a live rule with the score the active config gives it, if any. */
type ScoreRow = {
  rule: ScoredRuleVersion;
  /** null when the active config does not score this rule — the engine falls back to `unknownRuleScore`. */
  baseScore: number | null;
};

/** Live rules grouped by alert type, keys sorted within a group and groups by alert type. */
function groupRows(config: TriageConfigVersion, rules: ScoredRuleVersion[]) {
  const rows: ScoreRow[] = rules.map((rule) => ({
    rule,
    baseScore: config.rules.find((r) => r.ruleKey === rule.key)?.baseScore ?? null,
  }));
  const types = [...new Set(rows.map((r) => r.rule.alertType))].toSorted();
  return types.map((alertType) => ({
    alertType,
    rows: rows
      .filter((r) => r.rule.alertType === alertType)
      .toSorted((a, b) => a.rule.key.localeCompare(b.rule.key)),
  }));
}

/** The per-rule base scores of the active triage config, each editable on its band scale. */
export function TriageScoringPage({ author }: TriageScoringPageProps) {
  const triage = useTriageConfig(author);

  return (
    // The scroll container; the inner `min-h-full` column is what lets the footer's `sticky bottom-0` sit at the
    // bottom of the viewport on a long table and at the bottom of the content on a short one, as the rule form does.
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col">
        <div className="flex w-full max-w-[1040px] flex-1 flex-col gap-4 px-6 pt-4 pb-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[18px] leading-tight font-semibold text-fg">Rule scores</h1>
            <p className="max-w-[640px] text-fg-muted">
              How much each detection rule contributes to an alert&rsquo;s 0&ndash;100 score. The
              band the score falls into decides how the alert is handled. Changes apply from the
              next run.
            </p>
          </div>

          {triage.status === "loading" && (
            <p className="text-xs text-fg-subtle">Loading rule scores…</p>
          )}
          {triage.status === "error" && (
            <div className="flex items-center gap-3 text-xs text-high">
              Could not load the rule scores: {triage.message}
              <button type="button" onClick={triage.retry} className={button}>
                Retry
              </button>
            </div>
          )}
          {triage.status === "ready" && (
            <>
              <UnscoredCallout
                keys={triage.coverage.unscored}
                fallback={triage.config.payload.unknownRuleScore}
                bands={triage.config.payload.bands}
              />
              <ScoreTable
                config={triage.config}
                rules={triage.rules}
                draft={triage.draft}
                saving={triage.saving}
                onScore={triage.setScore}
                onRevert={triage.revert}
              />
            </>
          )}
        </div>
        {triage.status === "ready" && (
          <SavePanel
            dirtyKeys={triage.dirtyKeys}
            savedAt={triage.savedAt}
            saving={triage.saving}
            onDiscard={triage.discard}
            onSave={() => void triage.save()}
          />
        )}
      </div>
      {triage.error && (
        <Toast message={`Could not save: ${triage.error}`} onDone={triage.dismissError} />
      )}
    </div>
  );
}

/** What the footer's pill says: what is outstanding, else when this page last wrote, else that nothing is. */
function statusOf(dirtyKeys: string[], savedAt: string | null, saving: boolean) {
  if (saving) return { tone: "idle", text: "Saving…" } as const;
  if (dirtyKeys.length > 0)
    return {
      tone: "draft",
      text: `${plural(dirtyKeys.length, "unsaved change")} · ${dirtyKeys.join(", ")}`,
    } as const;
  if (savedAt)
    return { tone: "saved", text: `Saved at ${savedAt} · applies from the next run` } as const;
  return { tone: "idle", text: "All scores saved" } as const;
}

type SavePanelProps = {
  /** The changed rule keys, in key order. */
  dirtyKeys: string[];
  savedAt: string | null;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
};

/** The bottom bar: what is outstanding on the left, Discard and Save on the right. */
function SavePanel({ dirtyKeys, savedAt, saving, onDiscard, onSave }: SavePanelProps) {
  const dirty = dirtyKeys.length > 0;
  const s = statusOf(dirtyKeys, savedAt, saving);

  return (
    <div className="sticky bottom-0 flex flex-none flex-wrap items-center gap-3 border-t border-border bg-bg/90 px-6 py-2 backdrop-blur-md">
      <span className={footerStatus({ tone: s.tone })}>
        <span aria-hidden="true" className={footerDot({ tone: s.tone })} />
        {s.text}
      </span>
      <span className="flex-1" />
      {dirty && (
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="h-7 rounded px-3 text-[13px] font-semibold text-fg-muted hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
        >
          Discard
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className={saveButton({ dirty })}
      >
        {saving ? "Saving…" : dirty ? `Save ${plural(dirtyKeys.length, "change")}` : "Save"}
      </button>
    </div>
  );
}

/**
 * Puts one rule's score back where it was. The counter-clockwise arrow is drawn here rather than imported: the
 * shell's `ReplayIcon` lives in `app/`, which a feature may not import (ADR-0011).
 */
function RevertButton({
  ruleKey,
  to,
  disabled,
  onRevert,
}: {
  ruleKey: string;
  /** The stored score it goes back to; null for a rule the config does not score. */
  to: number | null;
  disabled: boolean;
  onRevert: () => void;
}) {
  const was = to === null ? "not set" : String(to);
  return (
    <button
      type="button"
      onClick={onRevert}
      disabled={disabled}
      title={`Revert to ${was}`}
      aria-label={`Revert ${ruleKey} to ${was}`}
      className="flex size-7 items-center justify-center rounded text-fg-muted hover:bg-indigo/8 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    </button>
  );
}

/** Names the rules the active config does not score, with the fallback the engine uses meanwhile. */
function UnscoredCallout({
  keys,
  fallback,
  bands,
}: {
  keys: string[];
  fallback: number;
  bands: Band[];
}) {
  if (keys.length === 0) return null;
  const disposition = bandOf(bands, fallback);
  const outcome = disposition ? BAND_OUTCOME[disposition] : "review";

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-med-dot/40 bg-med-bg px-3 py-2">
      <span aria-hidden="true" className="size-2 flex-none rounded-full bg-med-dot" />
      <span className="min-w-[240px] flex-1">
        <b className="font-semibold text-med">
          {listKeys(keys)} {keys.length === 1 ? "has" : "have"} no score.
        </b>{" "}
        <span className="text-fg-muted">
          Until it&rsquo;s set, the engine uses {fallback} and sends every alert to {outcome}.
        </span>
      </span>
    </div>
  );
}

type ScoreTableProps = {
  config: TriageConfigVersion;
  rules: ScoredRuleVersion[];
  /** The moved-but-unsaved scores by rule key; a row with one is highlighted and shows what it was. */
  draft: Record<string, number>;
  /** A save is in flight, so the whole table is read-only until it finishes. */
  saving: boolean;
  onScore: (ruleKey: string, baseScore: number) => void;
  /** Puts one rule back on its stored score. */
  onRevert: (ruleKey: string) => void;
};

function ScoreTable({ config, rules, draft, saving, onScore, onRevert }: ScoreTableProps) {
  const groups = groupRows(config, rules);
  const { bands, unknownRuleScore } = config.payload;

  if (groups.length === 0) {
    return <p className="text-xs text-fg-subtle">No rules to score yet.</p>;
  }

  return (
    // The card: the table scrolls sideways inside it rather than crushing its columns.
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[760px] table-fixed border-collapse">
        <thead>
          <tr className="border-b border-border bg-bg-sub text-left align-bottom text-xs font-semibold text-fg-muted">
            <th className={`${COL.rule} pt-2.5 pb-2`}>Rule</th>
            <th className={`${COL.name} pt-2.5 pb-2`}>Name</th>
            <th className={`${COL.slider} pt-2.5 pb-2 font-normal`}>
              <BandLegend bands={bands} />
            </th>
            <th className={`${COL.score} pt-2.5 pb-2`}>Score</th>
            <th className={`${COL.pill} pt-2.5 pb-2`}>Alone, it means</th>
            <th className={`${COL.revert} pt-2.5 pb-2`} />
          </tr>
        </thead>
        <tbody>
          {groups.map((group, i) => (
            <Fragment key={group.alertType}>
              <tr>
                <th
                  colSpan={6}
                  data-group={group.alertType}
                  className={`pt-2 pb-1 pl-[14px] text-left text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase ${
                    i > 0 ? "border-t border-border-soft" : ""
                  }`}
                >
                  Alert type {group.alertType}
                </th>
              </tr>
              {group.rows.map((row) => (
                <ScoreTableRow
                  key={row.rule.key}
                  row={row}
                  bands={bands}
                  unknownRuleScore={unknownRuleScore}
                  edited={draft[row.rule.key]}
                  saving={saving}
                  onScore={onScore}
                  onRevert={onRevert}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ScoreTableRowProps = {
  row: ScoreRow;
  bands: Band[];
  unknownRuleScore: number;
  /** The unsaved score, if the user has moved this rule's slider. */
  edited: number | undefined;
  saving: boolean;
  onScore: (ruleKey: string, baseScore: number) => void;
  onRevert: (ruleKey: string) => void;
};

/** One rule's row: its score on the band scale, what that alone means, and — once moved — the way back. */
function ScoreTableRow({
  row: { rule, baseScore },
  bands,
  unknownRuleScore,
  edited,
  saving,
  onScore,
  onRevert,
}: ScoreTableRowProps) {
  const dirty = edited !== undefined;
  const score = edited ?? baseScore;
  const scored = score !== null;
  const shown = score ?? unknownRuleScore;
  const disposition = bandOf(bands, shown);
  const outcome = disposition ? BAND_OUTCOME[disposition] : "review";

  return (
    <tr data-saving={saving || undefined} className={scoreRow({ dirty })}>
      <td className={`${COL.rule} py-1.5 font-mono font-bold`}>{rule.key}</td>
      <td className={`${COL.name} py-1.5`}>{rule.name ?? "—"}</td>
      <td className={`${COL.slider} py-1.5`}>
        <ScoreSlider
          ruleKey={rule.key}
          bands={bands}
          value={shown}
          scored={scored}
          disabled={saving}
          markAt={dirty ? (baseScore ?? unknownRuleScore) : null}
          onChange={(next) => onScore(rule.key, next)}
        />
      </td>
      <td className={`${COL.score} py-1.5`}>
        <span className="flex flex-col items-end gap-px">
          <span className={scoreNumber({ scored })}>{scored ? score : "—"}</span>
          {dirty && (
            <span data-slot="was" className="text-[11px] whitespace-nowrap text-draft-fg">
              was {baseScore === null ? "not set" : baseScore}
            </span>
          )}
        </span>
      </td>
      <td className={`${COL.pill} py-1.5`}>
        {scored && disposition ? (
          <span
            title={`An alert with only this rule scores ${score} and lands in ${outcome}`}
            className={bandPill({ disposition })}
          >
            {outcome}
          </span>
        ) : (
          <span
            title={`No score saved. The engine falls back to ${unknownRuleScore} and ${outcome}.`}
            className={bandPill({ unset: true })}
          >
            Not set · uses {unknownRuleScore}
          </span>
        )}
      </td>
      <td className={`${COL.revert} py-1.5`}>
        {dirty && (
          <RevertButton
            ruleKey={rule.key}
            to={baseScore}
            disabled={saving}
            onRevert={() => onRevert(rule.key)}
          />
        )}
      </td>
    </tr>
  );
}
