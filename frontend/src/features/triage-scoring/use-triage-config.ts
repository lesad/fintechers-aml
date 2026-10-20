import { useEffect, useState } from "react";

import {
  activeOf,
  approveProposal,
  discardProposal,
  fetchRuleVersions,
  fetchTriageConfigs,
  fetchTriageCoverage,
  liveVersions,
  openOf,
  proposeScores,
  rejectProposal,
  type RuleTriageChange,
  type ScoredRuleVersion,
  submitProposal,
  type TriageConfigVersion,
  type TriageCoverage,
} from "./api";

type Loaded = {
  /** Every stored version, newest first: the version history, and what every other view is read out of. */
  versions: TriageConfigVersion[];
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

/** The scores the user has moved away from what the proposal (or, with none, the active config) stores, by rule key. */
type Draft = Record<string, number>;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const now = () => new Date().toTimeString().slice(0, 5);

/** The whole policy a version gives [ruleKey], or null when it does not score it at all. */
const policyOf = (version: TriageConfigVersion, ruleKey: string) =>
  version.rules.find((r) => r.ruleKey === ruleKey) ?? null;

/** Loads every version with the coverage gap and the rules to name; a database with no active version is a failure. */
async function load(signal: AbortSignal): Promise<Loaded> {
  const [versions, coverage, ruleVersions] = await Promise.all([
    fetchTriageConfigs(signal),
    fetchTriageCoverage(signal),
    fetchRuleVersions(signal),
  ]);
  if (!activeOf(versions)) throw new Error("no triage config is active");
  return { versions, coverage, rules: liveVersions(ruleVersions) };
}

/**
 * The stored triage config versions, with the per-rule scores of the current one editable.
 *
 * Moving a slider only writes to [draft]; pressing Save sends every change at once as one **draft** version
 * (ADR-0056) — it does not move what triage runs under. The draft is then sent to an approver who neither wrote nor
 * sent it, and only their approval activates it. A second save stacks onto the same draft rather than opening another.
 *
 * Every stored version stays readable from the history: selecting an earlier one shows the scores it decided under,
 * read-only. A change reloads the list rather than patching it in place — an approval moves two rows at once, the
 * new version and the one it retires, and one request beats reconciling that here.
 */
export function useTriageConfig(author: string) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The version the history has selected; null follows the current one, which is where an edit lands. */
  const [selected, setSelected] = useState<number | null>(null);
  /** `HH:MM` of the last change that went through; any new edit clears it, as the design has it. */
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal)
      .then((loaded) => setState({ status: "ready", ...loaded }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "error", message: messageOf(err) });
      });
    return () => ctrl.abort();
  }, [attempt]);

  const versions = state.status === "ready" ? state.versions : [];
  const active = activeOf(versions);
  const proposal = openOf(versions);
  /** The version an edit is measured against and lands in: the open proposal, else the active config. */
  const current = proposal ?? active;
  /** What the table shows: the version the history selected, else the current one. */
  const shown = versions.find((v) => v.version === selected) ?? current;
  /** An earlier version is open for reading only — editing always means the current one. */
  const viewing = Boolean(current && shown && shown.version !== current.version);
  /** A version waiting for its approver is not edited — by anyone, including its author. */
  const locked = proposal?.status === "pending";
  const editable = state.status === "ready" && !saving && !locked && !viewing;

  /**
   * Records the score the user moved [ruleKey] to. Moving it back onto the stored score drops the entry rather than
   * keeping a no-op change, so the count and the Save button go back to where they were.
   */
  const setScore = (ruleKey: string, baseScore: number) => {
    if (!editable || !current) return;
    setSavedAt(null);
    setDraft((d) => {
      const { [ruleKey]: _dropped, ...rest } = d;
      return baseScore === (policyOf(current, ruleKey)?.baseScore ?? null)
        ? rest
        : { ...rest, [ruleKey]: baseScore };
    });
  };

  /** Puts one rule back on the score the proposal, or the active config, stores for it. */
  const revert = (ruleKey: string) => {
    if (!editable) return;
    setDraft(({ [ruleKey]: _dropped, ...rest }) => rest);
  };

  /** Drops every unsaved change at once. */
  const discard = () => {
    if (!editable) return;
    setDraft({});
  };

  /**
   * Runs one engine call and reads the version list back. The reload is what keeps the history honest: an approval
   * moves two rows at once, and a rejected call must leave the page showing what is really stored.
   */
  const run = async (call: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await call();
      setDraft({});
      setSavedAt(now());
      setSelected(null);
      setState({ status: "ready", ...(await load(new AbortController().signal)) });
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Writes every changed score into the proposal, in key order, in one call. Each change carries the rule's own
   * `autoCloseable` and `impliesPep` over, so a rescore does not reset the flags it says nothing about.
   */
  const save = async () => {
    if (!editable || !current) return;
    const changes: RuleTriageChange[] = Object.entries(draft)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([ruleKey, baseScore]) => ({
        ruleKey,
        baseScore,
        autoCloseable: policyOf(current, ruleKey)?.autoCloseable ?? false,
        impliesPep: policyOf(current, ruleKey)?.impliesPep ?? false,
      }));
    if (changes.length === 0) return;
    await run(() => proposeScores(author, changes));
  };

  /** Runs [call] against the open proposal, when there is one and nothing else is in flight. */
  const onProposal = async (call: (version: number) => Promise<unknown>) => {
    if (saving || !proposal) return;
    await run(() => call(proposal.version));
  };

  return {
    ...state,
    /** The moved-but-unsaved scores by rule key. */
    draft,
    /** The changed rule keys, in key order — what the footer names. */
    dirtyKeys: Object.keys(draft).toSorted(),
    dirtyCount: Object.keys(draft).length,
    /** The version triage runs under; null only while loading or after a failure. */
    active,
    /** The version being decided, when there is one. */
    proposal,
    /** The version the table shows — the selected one, else the one an edit lands in. */
    shown,
    /** An earlier version is open for reading: the table is read-only and the save bar is gone. */
    viewing,
    /** A version waits for its approver: the whole table is read-only until it is decided. */
    locked,
    /** A call is in flight: the whole table is read-only until it finishes. */
    saving,
    savedAt,
    error,
    dismissError: () => setError(null),
    select: (version: number) => {
      if (!saving) setSelected(version);
    },
    setScore,
    revert,
    discard,
    save,
    /** Sends the draft to [approverId]; it turns `pending` and nobody edits it until it is decided. */
    submit: (approverId: number) => onProposal((v) => submitProposal(v, approverId)),
    /** Approves the pending version: it becomes the config triage runs under from the next run. */
    approve: () => onProposal(approveProposal),
    /** Sends the pending version back to draft, so it can be changed and sent again. */
    reject: () => onProposal(rejectProposal),
    /** Throws the draft away, with everything it proposed. */
    discardProposal: () => onProposal(discardProposal),
    retry: () => {
      setState({ status: "loading" });
      setAttempt((a) => a + 1);
    },
  };
}
