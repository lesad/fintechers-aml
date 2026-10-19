import { useState } from "react";

import { cn } from "@/utils";

import { groupByKey, type RuleVersion } from "./api";
import { RuleDetail } from "./RuleDetail";
import { RuleForm } from "./RuleForm";
import { RuleList } from "./RuleList";
import { useRules } from "./use-rules";

type RulesPageProps = {
  /** Recorded as the author of every saved version. */
  author: string;
  onBack: () => void;
};

type Mode = { kind: "view" } | { kind: "form"; from: RuleVersion | null };

const button = "rounded border border-border bg-bg px-2.5 py-1 text-xs text-fg hover:bg-hover";

export function RulesPage({ author, onBack }: RulesPageProps) {
  const rules = useRules();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  // A just-saved draft shows at once, before the reload brings it back from the engine.
  const [saved, setSaved] = useState<RuleVersion[]>([]);

  const fetched = rules.status === "ready" ? rules.versions : [];
  const versions = [...fetched, ...saved.filter((s) => !fetched.some((v) => v.id === s.id))];
  const groups = groupByKey(versions);
  const group = groups.find((g) => g.key === selectedKey) ?? groups[0];
  const version = group?.versions.find((v) => v.id === selectedId) ?? group?.versions[0];

  const select = (key: string, id: number | null = null) => {
    setSelectedKey(key);
    setSelectedId(id);
    setMode({ kind: "view" });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2 border-b border-border bg-bg-sub px-4 py-2 text-xs">
        <button type="button" onClick={onBack} className="text-fg-muted hover:text-fg">
          ← Review queue
        </button>
        <span className="text-fg-subtle">/</span>
        <b>Rules</b>
      </div>

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
        <div className="flex min-h-0 flex-1">
          <div className="flex w-1/3 max-w-xs flex-none flex-col overflow-y-auto border-r border-border">
            <div className="p-2.5">
              <button
                type="button"
                onClick={() => setMode({ kind: "form", from: null })}
                className="rounded bg-indigo px-2.5 py-1 text-xs text-white"
              >
                + New rule
              </button>
            </div>
            <RuleList
              groups={groups}
              selectedKey={group?.key ?? null}
              onSelect={(key) => select(key)}
            />
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            <Panel
              mode={mode}
              version={version}
              siblings={group?.versions ?? []}
              author={author}
              onMode={setMode}
              onSelectVersion={setSelectedId}
              onSaved={(v) => {
                setSaved((s) => [...s, v]);
                select(v.key, v.id);
                rules.reload();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type PanelProps = {
  mode: Mode;
  version: RuleVersion | undefined;
  siblings: RuleVersion[];
  author: string;
  onMode: (mode: Mode) => void;
  onSelectVersion: (id: number) => void;
  onSaved: (saved: RuleVersion) => void;
};

function Panel({ mode, version, siblings, author, onMode, onSelectVersion, onSaved }: PanelProps) {
  if (mode.kind === "form") {
    return (
      <RuleForm
        key={mode.from?.id ?? "new"}
        from={mode.from}
        author={author}
        onCancel={() => onMode({ kind: "view" })}
        onSaved={onSaved}
      />
    );
  }
  if (!version) return <p className="text-xs text-fg-subtle">No rules yet.</p>;
  return (
    <RuleDetail
      version={version}
      siblings={siblings}
      onSelectVersion={onSelectVersion}
      actions={
        <button
          type="button"
          onClick={() => onMode({ kind: "form", from: version })}
          className={cn(button, "self-start")}
        >
          New version from this
        </button>
      }
    />
  );
}
