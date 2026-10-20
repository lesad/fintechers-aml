import { useRef, useState } from "react";

import { ROLE_LABEL, type User } from "@/user";

import { Icon } from "./Icon";
import { Popover } from "./Popover";

/** The split button's three parts, shared with any other split button on a screen (the rules' Approve). */
export const splitMain =
  "inline-flex h-7 items-center gap-1.5 rounded-l bg-indigo px-3 text-[13px] font-semibold text-white hover:bg-indigo-hover disabled:cursor-not-allowed disabled:bg-retired-dot";
export const splitMore =
  "inline-flex h-7 items-center rounded-r border-l border-white/30 bg-indigo px-1.5 text-white hover:bg-indigo-hover disabled:cursor-not-allowed disabled:bg-retired-dot";
export const splitOption =
  "flex w-full cursor-pointer items-baseline gap-1 rounded px-2 py-1.5 text-left text-[13px] hover:bg-hover";

type SendForApprovalProps = {
  /** Who the main button sends to: the first eligible compliance officer, else the first eligible approver. */
  fallback: User | undefined;
  eligible: User[];
  busy: boolean;
  onSend: (approverId: number) => void;
};

/**
 * A split button: the main part sends to the default approver, the arrow picks another eligible one and sends.
 * Four eyes (ADR-0052) is decided by the caller — it passes only the people who may decide what it is sending.
 */
export function SendForApproval({ fallback, eligible, busy, onSend }: SendForApprovalProps) {
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        disabled={busy || !fallback}
        onClick={() => fallback && onSend(fallback.id)}
        className={splitMain}
      >
        <Icon name="check" />
        {fallback ? `Send to ${fallback.name}` : "No approver available"}
      </button>
      <button
        ref={more}
        type="button"
        aria-label="Choose approver"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy || eligible.length === 0}
        onClick={() => setOpen(!open)}
        className={splitMore}
      >
        <Icon name="chevronDown" />
      </button>
      {open && (
        <Popover
          anchor={more}
          onClose={() => setOpen(false)}
          className="w-max min-w-56 gap-0 p-1.5"
        >
          <span className="px-2 pb-1 text-[11px] text-fg-subtle">Send for approval to</span>
          <div role="menu" aria-label="Approvers" className="flex flex-col">
            {eligible.map((u) => (
              <button
                key={u.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSend(u.id);
                }}
                className={splitOption}
              >
                {u.name}
                <span className="text-fg-subtle">· {ROLE_LABEL[u.role]}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** Four eyes (ADR-0052): the compliance officer's level and above approve what someone else wrote. */
export const APPROVER_ROLES = new Set<User["role"]>(["COMPLIANCE_OFFICER", "COMPLIANCE_MANAGER"]);

/**
 * Who may decide a version written by [author] and sent by [sender]: an approver who is neither. The first compliance
 * officer among them is the one the split button's main part sends to.
 */
export function approvers(users: User[], author: string | null, sender: User | null) {
  const eligible = users.filter(
    (u) => APPROVER_ROLES.has(u.role) && u.name !== author && u.name !== sender?.name,
  );
  return {
    eligible,
    fallback: eligible.find((u) => u.role === "COMPLIANCE_OFFICER") ?? eligible[0],
  };
}
