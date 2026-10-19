import { cva } from "class-variance-authority";
import { useId, useRef, useState } from "react";

import { Popover } from "@/components";

import type { User } from "@/user";

/** `J. Novák` → `JN` */
const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

const ROLE_LABEL: Record<User["role"], string> = { REVIEWER: "Reviewer", MANAGER: "Manager" };

const choice = cva(
  "flex w-full cursor-pointer items-baseline gap-1 rounded px-2 py-1.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-purple/40",
  { variants: { checked: { true: "bg-sel font-semibold", false: "hover:bg-hover" } } },
);

/** The signed-in user's name and avatar; the avatar opens the list of users, one click switches. */
export function UserMenu({
  user,
  users,
  onUser,
}: {
  user: User | null;
  users: User[];
  onUser: (user: User) => void;
}) {
  const [open, setOpen] = useState(false);
  const avatar = useRef<HTMLButtonElement>(null);
  const label = useId();

  return (
    <div className="relative flex items-center gap-2">
      <span className="text-xs text-indigo-20">{user?.name}</span>
      <button
        ref={avatar}
        type="button"
        aria-label="Switch user"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex size-[26px] cursor-pointer items-center justify-center rounded-full border-0 bg-indigo-80 text-[11px] font-semibold text-white outline-none hover:bg-indigo-60 focus-visible:ring-2 focus-visible:ring-yellow"
      >
        {user ? initials(user.name) : "?"}
      </button>
      {open && (
        <Popover anchor={avatar} onClose={() => setOpen(false)} className="w-56">
          <span id={label} className="px-2 text-[11px] text-fg-subtle">
            Signed in as
          </span>
          <div role="radiogroup" aria-labelledby={label} className="flex flex-col">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={u.id === user?.id}
                onClick={() => {
                  if (u.id !== user?.id) onUser(u);
                  setOpen(false);
                }}
                className={choice({ checked: u.id === user?.id })}
              >
                {u.name}
                <span className="font-normal text-fg-subtle">· {ROLE_LABEL[u.role]}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
