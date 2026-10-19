import { useState } from "react";

import { explainRule, type NewRule } from "./api";

type Preview =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string; of: string }
  | { status: "error"; message: string };

type ExplanationPreviewProps = {
  rule: NewRule;
  /** True while the draft has issues, so the engine would refuse it. */
  blocked: boolean;
};

/** "What it flags" for a draft, written by the engine's explainer on request; saving writes it again. */
export function ExplanationPreview({ rule, blocked }: ExplanationPreviewProps) {
  const [preview, setPreview] = useState<Preview>({ status: "idle" });
  const current = JSON.stringify(rule);
  const stale = preview.status === "done" && preview.of !== current;

  const write = async () => {
    setPreview({ status: "loading" });
    try {
      const { explanation } = await explainRule(rule);
      setPreview({ status: "done", text: explanation, of: current });
    } catch (err) {
      setPreview({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-md border border-ai-line bg-ai-bg px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {preview.status === "done" && <p className="text-sm text-pretty text-fg">{preview.text}</p>}
        {stale && (
          <p className="text-xs text-fg-subtle">
            The rule changed since; write it again for this version.
          </p>
        )}
        {preview.status === "idle" && (
          <p className="text-fg-muted">
            Ask the AI to explain this rule in plain words. Saving the draft writes it too.
          </p>
        )}
        {preview.status === "loading" && <p className="text-fg-muted">Writing explanation…</p>}
        {preview.status === "error" && (
          <p role="alert" className="text-high">
            {preview.message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={write}
        disabled={blocked || preview.status === "loading"}
        title={blocked ? "Fix the issues first" : undefined}
        className="h-7 flex-none rounded border border-ai-fg bg-bg px-3 text-[13px] font-semibold text-ai-fg hover:bg-ai-fg hover:text-white disabled:cursor-not-allowed disabled:border-border disabled:text-fg-subtle disabled:hover:bg-bg"
      >
        {preview.status === "done" ? "Write again" : "Write explanation"}
      </button>
    </div>
  );
}
