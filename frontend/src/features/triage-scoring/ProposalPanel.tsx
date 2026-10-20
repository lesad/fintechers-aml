import { APPROVER_ROLES, approvers, Icon, SendForApproval } from "@/components";

import { scoreChanges } from "./history";

import type { TriageConfigVersion } from "./api";
import type { User } from "@/user";

const primary =
  "inline-flex h-7 items-center gap-1.5 rounded bg-indigo px-3 text-[13px] font-semibold text-white hover:bg-indigo-hover disabled:cursor-not-allowed disabled:bg-retired-dot";
const secondary =
  "inline-flex h-7 items-center gap-1.5 rounded border border-indigo bg-bg px-3 text-[13px] font-semibold text-indigo hover:bg-indigo hover:text-white disabled:cursor-not-allowed disabled:opacity-60";
const danger =
  "inline-flex h-7 items-center gap-1.5 rounded border border-high-dot bg-bg px-3 text-[13px] font-semibold text-high hover:bg-high-bg disabled:cursor-not-allowed disabled:opacity-60";

type ProposalPanelProps = {
  active: TriageConfigVersion;
  /** The version being decided: a draft being written, or one waiting for its approver. */
  proposal: TriageConfigVersion;
  /** The signed-in user; null before one is picked. */
  user: User | null;
  /** Everyone an author can send a draft to, among others. */
  users: User[];
  /** A call is in flight, so every action is held. */
  busy: boolean;
  onSubmit: (approverId: number) => void;
  onApprove: () => void;
  onReject: () => void;
  onDiscard: () => void;
};

/**
 * The open proposal above the table: what it would change, where it is in the four-eyes check, and the one action
 * the signed-in user can take on it. It is the triage policy's counterpart to a rule version's draft note.
 */
export function ProposalPanel({
  active,
  proposal,
  user,
  users,
  busy,
  onSubmit,
  onApprove,
  onReject,
  onDiscard,
}: ProposalPanelProps) {
  const pending = proposal.status === "pending";
  const changes = scoreChanges(active, proposal);

  return (
    <section
      aria-label={`Proposed triage policy v${proposal.version}`}
      className="flex flex-col gap-2 rounded-md border border-draft-line bg-sel px-3.5 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Who wrote it and who it is with is the header's version line; this says only what it means. */}
        <span className="min-w-[260px] flex-1 font-semibold">
          {pending
            ? `v${proposal.version} waiting for approval by ${proposal.assignee ?? "a compliance officer"} — not deciding alerts yet`
            : `Draft v${proposal.version} — not deciding alerts yet`}
        </span>
        <Actions
          proposal={proposal}
          user={user}
          users={users}
          busy={busy}
          onSubmit={onSubmit}
          onApprove={onApprove}
          onReject={onReject}
          onDiscard={onDiscard}
        />
      </div>
      {changes.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-fg-muted">
            {changes.length === 1 ? "One score changes" : `${changes.length} scores change`} against
            v{active.version}:
          </div>
          {changes.map((c) => (
            <div key={c.ruleKey} className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="font-bold">{c.ruleKey}</span>
              <span className="rounded-[3px] bg-high-bg px-1.5 py-px text-high line-through">
                {c.from ?? "not set"}
              </span>
              <span className="text-fg-subtle">→</span>
              <span className="rounded-[3px] bg-low-bg px-1.5 py-px font-bold text-low">
                {c.to}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type ActionsProps = Omit<ProposalPanelProps, "active">;

/** The one action the signed-in user may take: send it on, decide it, or — as its author — throw it away. */
function Actions({
  proposal,
  user,
  users,
  busy,
  onSubmit,
  onApprove,
  onReject,
  onDiscard,
}: ActionsProps) {
  // Four eyes (ADR-0052): neither the author nor whoever sends it approves it.
  const { eligible, fallback } = approvers(users, proposal.author, user);

  if (proposal.status !== "pending") {
    return (
      <>
        <button type="button" disabled={busy} onClick={onDiscard} className={danger}>
          <Icon name="trash" />
          Discard draft
        </button>
        <SendForApproval fallback={fallback} eligible={eligible} busy={busy} onSend={onSubmit} />
      </>
    );
  }
  if (!user || !APPROVER_ROLES.has(user.role)) return null;
  if (proposal.author === user.name) {
    return (
      <span className="text-xs text-fg-muted">
        You wrote this version; {proposal.assignee ?? "another approver"} decides it.
      </span>
    );
  }
  // A compliance officer decides any version they did not write; a compliance manager only the one sent to them.
  if (user.role === "COMPLIANCE_MANAGER" && proposal.assignee !== user.name) return null;
  return (
    <>
      <button type="button" disabled={busy} onClick={onReject} className={secondary}>
        <Icon name="close" />
        Reject
      </button>
      <button type="button" disabled={busy} onClick={onApprove} className={primary}>
        <Icon name="check" />
        Approve v{proposal.version}
      </button>
    </>
  );
}
