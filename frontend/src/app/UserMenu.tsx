import { useRef, useState } from "react";

import { Popover, Select } from "@/components";

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

/** The signed-in user's name and avatar; the avatar opens a select to switch to another user. */
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
          <label htmlFor="user-switch" className="text-[11px] text-fg-subtle">
            Signed in as
          </label>
          <Select
            id="user-switch"
            value={user?.id ?? ""}
            onChange={(e) => {
              const next = users.find((u) => u.id === Number(e.target.value));
              if (next) onUser(next);
              setOpen(false);
            }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {ROLE_LABEL[u.role]}
              </option>
            ))}
          </Select>
        </Popover>
      )}
    </div>
  );
}
