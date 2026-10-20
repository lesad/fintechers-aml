import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { groupByKey, type RuleVersion } from "./api";
import { BacktestDialog } from "./BacktestDialog";
import { DeleteDraftDialog } from "./DeleteDraftDialog";
import { RuleDetail } from "./RuleDetail";
import { RuleExport } from "./RuleExport";
import { RuleForm } from "./RuleForm";
import { RuleList } from "./RuleList";
import { useRules } from "./use-rules";

import type { User } from "@/user";

type RulesPageProps = {
  /** Recorded as the author of every saved version. */
  author: string;
  /** The signed-in user; null before one is picked. */
  user: User | null;
  /** Everyone an author can send a draft to, among others. */
  users: User[];
  /** Opens the backtest just started for [draft] in its own tab. */
  onBacktest: (draft: RuleVersion) => void;
  /** A version was approved and is now active; the engine recalculates the alerts with it. */
  onApproved?: (approved: RuleVersion) => void;
};

/** A dialog over the selected draft. */
type Dialog = "delete" | "backtest" | null;

type Mode =
  | { kind: "view" }
  | { kind: "form"; from: RuleVersion | null; edit?: boolean }
  | { kind: "export" };

const button = "rounded border border-border bg-bg px-2.5 py-1 text-xs text-fg hover:bg-hover";

export function RulesPage({ author, user, users, onBacktest, onApproved }: RulesPageProps) {
  const rules = useRules();
  const { selectedKey, setSelectedKey, selectedId, setSelectedId } = useSelection();
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [dialog, setDialog] = useState<Dialog>(null);
  // NOTE: a just-saved draft shows at once, before the reload brings it back from the engine.
  const [saved, setSaved] = useState<RuleVersion[]>([]);
  // A deleted draft disappears at once, before the reload confirms it.
  const [deleted, setDeleted] = useState<number[]>([]);

  const fetched = rules.status === "ready" ? rules.versions : [];
  // An edited draft keeps its id, so the saved copy replaces the fetched one.
  const versions = [...fetched.filter((v) => !saved.some((s) => s.id === v.id)), ...saved].filter(
    (v) => !deleted.includes(v.id),
  );
  const groups = groupByKey(versions);
  const { group, version } = pick(groups, selectedKey, selectedId);

  const select = (key: string, id: number | null = null) => {
    setSelectedKey(key);
    setSelectedId(id);
    setMode({ kind: "view" });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col print:block">
      {rules.status === "loading" && <p className="p-4 text-xs text-fg-subtle">Loading rules…</p>}
      {rules.status === "error" && (
        <div className="flex items-center gap-3 p-4 text-xs text-high">
          Could not load the rules: {rules.message}
          <button type="button" onClick={rules.retry} className={button}>
            Retry
          </button>
        </div>
      )}
      {rules.status === "ready" && (
        <div className="flex min-h-0 flex-1 print:block">
          <RuleList
            groups={groups}
            selectedKey={group?.key ?? null}
            onSelect={(key) => select(key)}
            onNew={() => setMode({ kind: "form", from: null })}
            onExport={() => setMode({ kind: "export" })}
          />
          <div className="min-w-0 flex-1 overflow-y-auto print:overflow-visible">
            <Panel
              mode={mode}
              version={version}
              versions={versions}
              siblings={group?.versions ?? []}
              keys={groups.map((g) => g.key)}
              author={author}
              user={user}
              users={users}
              onMode={setMode}
              onDialog={setDialog}
              onSelectVersion={setSelectedId}
              onSaved={(v) => {
                // NOTE: an approval retires a sibling, so earlier saved copies of the key go stale.
                setSaved((s) => [...s.filter((x) => x.key !== v.key), v]);
                select(v.key, v.id);
                rules.reload();
                // Only an approval makes a version active; a save is a draft, a submit pending.
                if (v.status === "active") onApproved?.(v);
              }}
            />
          </div>
        </div>
      )}
      {version?.status === "draft" && (
        <DraftDialog
          dialog={dialog}
          draft={version}
          active={group?.versions.find((v) => v.status === "active")}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDeleted((d) => [...d, version.id]);
            select(version.key);
            rules.reload();
          }}
          onBacktest={() => onBacktest(version)}
        />
      )}
    </div>
  );
}

/**
 * The selected key and version. `?rule=<id>` opens that version, e.g. a draft saved from a rule suggestion, also
 * when the rules tab is already open.
 */
function useSelection() {
  const [params] = useSearchParams();
  const linked = Number(params.get("rule")) || null;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(linked);
  useEffect(() => {
    if (!linked) return;
    setSelectedId(linked);
    setSelectedKey(null);
  }, [linked]);
  return { selectedKey, setSelectedKey, selectedId, setSelectedId };
}

/** The open dialog over a draft: delete it, or pick a period to backtest it over. */
function DraftDialog({
  dialog,
  draft,
  active,
  onClose,
  onDeleted,
  onBacktest,
}: {
  dialog: Dialog;
  draft: RuleVersion;
  active: RuleVersion | undefined;
  onClose: () => void;
  onDeleted: () => void;
  onBacktest: () => void;
}) {
  if (dialog === "delete")
    return (
      <DeleteDraftDialog
        draft={draft}
        active={active}
        onClose={onClose}
        onDeleted={() => {
          onClose();
          onDeleted();
        }}
      />
    );
  if (dialog === "backtest")
    return (
      <BacktestDialog
        draft={draft}
        active={active}
        onClose={onClose}
        onStarted={() => {
          onClose();
          onBacktest();
        }}
      />
    );
  return null;
}

type Group = ReturnType<typeof groupByKey>[number];

/** The selected key (or the key of the selected id, or the first), on the selected, active or newest version. */
function pick(groups: Group[], key: string | null, id: number | null) {
  const group =
    groups.find((g) => g.key === key) ??
    groups.find((g) => g.versions.some((v) => v.id === id)) ??
    groups[0];
  const version =
    group?.versions.find((v) => v.id === id) ??
    group?.versions.find((v) => v.status === "active") ??
    group?.versions[0];
  return { group, version };
}

type PanelProps = {
  mode: Mode;
  version: RuleVersion | undefined;
  /** Every version of every key, for the export. */
  versions: RuleVersion[];
  siblings: RuleVersion[];
  /** Every rule key, so a new rule cannot reuse one. */
  keys: string[];
  author: string;
  user: User | null;
  users: User[];
  onMode: (mode: Mode) => void;
  onDialog: (dialog: Dialog) => void;
  onSelectVersion: (id: number) => void;
  onSaved: (saved: RuleVersion) => void;
};

function Panel({
  mode,
  version,
  versions,
  siblings,
  keys,
  author,
  user,
  users,
  onMode,
  onDialog,
  onSelectVersion,
  onSaved,
}: PanelProps) {
  if (mode.kind === "export") {
    return (
      <RuleExport versions={versions} author={author} onClose={() => onMode({ kind: "view" })} />
    );
  }
  if (mode.kind === "form") {
    return (
      <RuleForm
        key={`${mode.from?.id ?? "new"}-${mode.edit ? "edit" : "version"}`}
        from={mode.from}
        edit={mode.edit}
        author={author}
        nextVersion={mode.from ? Math.max(...siblings.map((s) => s.version)) + 1 : 1}
        existingKeys={keys}
        onCancel={() => onMode({ kind: "view" })}
        onSaved={onSaved}
      />
    );
  }
  if (!version) return <p className="p-4 text-xs text-fg-subtle">No rules yet.</p>;
  return (
    <RuleDetail
      version={version}
      siblings={siblings}
      onSelectVersion={onSelectVersion}
      onNewVersion={() => onMode({ kind: "form", from: version })}
      onEditDraft={() => onMode({ kind: "form", from: version, edit: true })}
      user={user}
      users={users}
      onStatusChanged={onSaved}
      onDelete={() => onDialog("delete")}
      onBacktest={() => onDialog("backtest")}
    />
  );
}
