import { useEffect, useState } from "react";

import {
  fetchRuleVersions,
  fetchTriageConfig,
  fetchTriageCoverage,
  liveVersions,
  patchRuleScore,
  type ScoredRuleVersion,
  type TriageConfigVersion,
  type TriageCoverage,
} from "./api";

type Loaded = {
  config: TriageConfigVersion;
  coverage: TriageCoverage;
  /** One version per rule key: the active one, else the newest. */
  rules: ScoredRuleVersion[];
};

type State =
  | { status: "loading" }
  | ({ status: "ready" } & Loaded)
  | {
      status: "error";
      message: string;
    };

/** The scores the user has moved away from what the active config stores, by rule key. */
type Draft = Record<string, number>;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The score the active config gives [ruleKey], or null when it does not score it at all. */
const storedScore = (config: TriageConfigVersion, ruleKey: string) =>
  config.rules.find((r) => r.ruleKey === ruleKey)?.baseScore ?? null;

/**
 * The active triage config, the rules it scores and its coverage gap, with the per-rule scores editable.
 *
 * Moving a slider only writes to [draft] — nothing reaches the engine until [save]. A save then sends one PATCH per
 * changed rule **in sequence**: each one derives a new config version from the active one and activates it, so two
 * in flight at once race for the same next version and the engine answers 409. The last response is the new config.
 */
export function useTriageConfig(author: string) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** `HH:MM` of the last save that went through whole; any new edit clears it, as the design has it. */
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      fetchTriageConfig(ctrl.signal),
      fetchTriageCoverage(ctrl.signal),
      fetchRuleVersions(ctrl.signal),
    ])
      .then(([config, coverage, versions]) =>
        setState({ status: "ready", config, coverage, rules: liveVersions(versions) }),
      )
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", message: messageOf(err) });
      });
    return () => ctrl.abort();
  }, [attempt]);

  /**
   * Records the score the user moved [ruleKey] to. Moving it back onto the stored score drops the entry rather than
   * keeping a no-op change, so the count and the Save button go back to where they were.
   */
  const setScore = (ruleKey: string, baseScore: number) => {
    if (state.status !== "ready" || saving) return;
    setSavedAt(null);
    setDraft((d) => {
      const { [ruleKey]: _dropped, ...rest } = d;
      return baseScore === storedScore(state.config, ruleKey)
        ? rest
        : { ...rest, [ruleKey]: baseScore };
    });
  };

  /** Puts one rule back on the score the active config stores for it. */
  const revert = (ruleKey: string) => {
    if (saving) return;
    setDraft(({ [ruleKey]: _dropped, ...rest }) => rest);
  };

  /** Drops every unsaved change at once. */
  const discard = () => {
    if (saving) return;
    setDraft({});
  };

  /**
   * Writes every changed score, one PATCH at a time, in key order. A refusal stops the run: the rules already
   * written stay written — the engine committed them and there is no undo — and the rest stay dirty for a retry.
   */
  const save = async () => {
    if (state.status !== "ready" || saving) return;
    const changes = Object.entries(draft).toSorted(([a], [b]) => a.localeCompare(b));
    if (changes.length === 0) return;

    setSaving(true);
    setError(null);
    let config = state.config;
    const written: string[] = [];
    try {
      for (const [ruleKey, baseScore] of changes) {
        const current = config.rules.find((r) => r.ruleKey === ruleKey);
        // The rule's advice (Promise.all) is exactly what must not happen here: each PATCH derives the next config
        // version from the active one and activates it, so two in flight race and the engine answers 409. Awaiting
        // in the loop is the ordering guarantee, and it is also how a refusal stops the rules after it.
        // oxlint-disable-next-line no-await-in-loop
        config = await patchRuleScore(ruleKey, {
          author,
          baseScore,
          autoCloseable: current?.autoCloseable ?? false,
          impliesPep: current?.impliesPep ?? false,
        });
        written.push(ruleKey);
      }
    } catch (err: unknown) {
      setError(messageOf(err));
    }

    // Only a run that wrote everything counts as saved; a partial one leaves changes outstanding to say so.
    if (written.length === changes.length) setSavedAt(new Date().toTimeString().slice(0, 5));
    setSaving(false);
    setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !written.includes(k))));
    setState((s) =>
      s.status === "ready"
        ? {
            ...s,
            config,
            coverage: {
              ...s.coverage,
              unscored: s.coverage.unscored.filter((k) => !written.includes(k)),
            },
          }
        : s,
    );
  };

  return {
    ...state,
    /** The moved-but-unsaved scores by rule key. */
    draft,
    /** The changed rule keys, in key order — what the footer names. */
    dirtyKeys: Object.keys(draft).toSorted(),
    dirtyCount: Object.keys(draft).length,
    /** A save is in flight: the whole table is read-only until it finishes. */
    saving,
    savedAt,
    error,
    dismissError: () => setError(null),
    setScore,
    revert,
    discard,
    save,
    retry: () => {
      setState({ status: "loading" });
      setAttempt((a) => a + 1);
    },
  };
}
