import { useState } from "react";

import { groupByKey } from "./api";
import { RuleDetail } from "./RuleDetail";
import { RuleList } from "./RuleList";
import { useRules } from "./use-rules";

type RulesPageProps = {
  /** Recorded as the author of every saved version. */
  author: string;
  onBack: () => void;
};

export function RulesPage({ onBack }: RulesPageProps) {
  const rules = useRules();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const groups = rules.status === "ready" ? groupByKey(rules.versions) : [];
  const group = groups.find((g) => g.key === selectedKey) ?? groups[0];
  const version = group?.versions.find((v) => v.id === selectedId) ?? group?.versions[0];

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
          <button
            type="button"
            onClick={rules.retry}
            className="rounded border border-border px-2 py-1 text-fg"
          >
            Retry
          </button>
        </div>
      )}
      {rules.status === "ready" && (
        <div className="flex min-h-0 flex-1">
          <div className="w-1/3 max-w-xs flex-none overflow-y-auto border-r border-border">
            <RuleList
              groups={groups}
              selectedKey={group?.key ?? null}
              onSelect={(key) => {
                setSelectedKey(key);
                setSelectedId(null);
              }}
            />
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {version && group ? (
              <RuleDetail
                version={version}
                siblings={group.versions}
                onSelectVersion={setSelectedId}
              />
            ) : (
              <p className="text-xs text-fg-subtle">No rules yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
