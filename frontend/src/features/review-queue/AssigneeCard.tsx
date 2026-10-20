import { useRef, useState } from "react";

import { Card, Popover } from "@/components";
import { initials, ROLE_LABEL, type User } from "@/user";

type AssigneeCardProps = {
  assignee: User | null;
  users: User[];
  /** A closed case (false positive, reported) keeps its assignee: no "Change". */
  closed: boolean;
  /** Saves to the engine first; a rejection is shown in the card. */
  onAssign: (user: User) => Promise<void>;
};

/** Who works the case; "Change" hands it to another user. */
export function AssigneeCard({ assignee, users, closed, onAssign }: AssigneeCardProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const others = users.filter((u) => u.id !== assignee?.id);

  const pick = (user: User) => {
    setOpen(false);
    setError(null);
    onAssign(user).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  };

  return (
    <Card
      raised
      title="Assignee"
      aside={
        !closed && (
          <div className="relative ml-auto">
            <button
              ref={button}
              type="button"
              aria-expanded={open}
              disabled={others.length === 0}
              onClick={() => setOpen(!open)}
              className="h-7 cursor-pointer rounded-md border border-border bg-transparent px-2.5 text-xs font-semibold text-fg enabled:hover:border-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              Change
            </button>
            {open && (
              <Popover anchor={button} onClose={() => setOpen(false)} className="w-max min-w-56">
                <span className="px-2 text-[11px] text-fg-subtle">Hand the case to</span>
                {others.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => pick(u)}
                    className="flex w-full cursor-pointer items-baseline gap-1 rounded border-0 bg-transparent px-2 py-1.5 text-left text-[13px] whitespace-nowrap outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-purple/40"
                  >
                    {u.name}
                    <span className="font-normal text-fg-subtle">· {ROLE_LABEL[u.role]}</span>
                  </button>
                ))}
              </Popover>
            )}
          </div>
        )
      }
    >
      {assignee ? (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 flex-none items-center justify-center rounded-full bg-indigo-80 text-xs font-semibold text-white">
            {initials(assignee.name)}
          </span>
          <span className="flex flex-col">
            <span className="text-[13px] font-semibold">{assignee.name}</span>
            <span className="text-xs text-fg-muted">{ROLE_LABEL[assignee.role]}</span>
          </span>
        </div>
      ) : (
        <span className="text-[13px] text-fg-muted">Nobody yet.</span>
      )}
      {error && (
        <span role="alert" className="text-xs text-high">
          {error}
        </span>
      )}
    </Card>
  );
}
