import { useState } from "react";

import { Modal } from "@/components";

import { deleteRule, type RuleVersion } from "./api";

/** Confirms deleting a draft; a key with no other version goes with it. */
export function DeleteDraftDialog({
  draft,
  active,
  onDeleted,
  onClose,
}: {
  draft: RuleVersion;
  /** The key's active version, which stays. */
  active: RuleVersion | undefined;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      label={`Delete draft ${draft.key} v${draft.version}`}
      onClose={onClose}
      className="max-w-[440px]"
      header={
        <h2 className="m-0 text-base font-bold">
          Delete draft {draft.key} v{draft.version}?
        </h2>
      }
    >
      <div className="flex flex-col gap-3 px-[18px] py-4">
        <p className="m-0 text-[13px] text-pretty text-fg-muted">
          {active
            ? `The draft is removed. v${active.version} stays active. This cannot be undone.`
            : `${draft.key} has no other version, so the rule is removed too. This cannot be undone.`}
        </p>
        {error && (
          <span role="alert" className="text-xs text-high">
            {error}
          </span>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 cursor-pointer rounded-md border border-border bg-transparent px-3.5 text-[13px] font-semibold text-fg hover:border-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              deleteRule(draft.id)
                .then(onDeleted)
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : String(err));
                  setBusy(false);
                });
            }}
            className="h-8 cursor-pointer rounded-md border-0 bg-high-dot px-3.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete draft
          </button>
        </div>
      </div>
    </Modal>
  );
}
