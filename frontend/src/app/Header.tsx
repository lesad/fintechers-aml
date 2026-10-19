import { cva } from "class-variance-authority";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { cn } from "@/utils";

import { UserMenu } from "./UserMenu";

import type { RiskLevel } from "@/components";
import type { User } from "@/user";

type HeaderProps = {
  /** Null until the engine has answered: the counts show as skeletons. */
  openByRating: Record<RiskLevel, number> | null;
  /** Opens the transaction if it exists; resolves to false when the id is unknown. */
  onJump: (id: string) => Promise<boolean>;
  user: User | null;
  users: User[];
  onUser: (user: User) => void;
  /** The page open instead of the review overview, if any; its button shows as active. */
  page: "rules" | "import" | null;
  onTogglePage: (page: "rules" | "import") => void;
  /** The logo: back to the review queue tab. */
  onHome: () => void;
};

const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";

const levels: RiskLevel[] = ["High", "Medium", "Low"];

// Brighter risk colours that read on the indigo bar.
const dot = cva("size-[7px] rounded-[2px]", {
  variants: {
    level: { High: "bg-header-high", Medium: "bg-header-med", Low: "bg-header-low" },
  },
});

const pageButton = cva(
  "flex size-7 items-center justify-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-yellow",
  {
    variants: {
      active: {
        true: "border-yellow bg-yellow/12 text-yellow",
        false:
          "border-transparent text-indigo-20 hover:border-indigo-80 hover:bg-header-input hover:text-yellow",
      },
    },
  },
);

const hint = cva("pointer-events-none absolute right-2 text-[11px]", {
  variants: { miss: { true: "text-header-miss", false: "text-indigo-60" } },
});

export function Header({
  openByRating,
  onJump,
  user,
  users,
  onUser,
  page,
  onTogglePage,
  onHome,
}: HeaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [miss, setMiss] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "k" || e.key === "Enter")) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="flex h-11 flex-none items-center gap-4 bg-[linear-gradient(90deg,#252746_0%,#2b2c55_55%,#3a2e66_100%)] px-4 text-white">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <Link
          to="/"
          onClick={onHome}
          className="flex-none rounded outline-none focus-visible:ring-2 focus-visible:ring-yellow"
        >
          <img src="/aml-spotter-logo-white.png" alt="AML spotter" className="block h-7 w-auto" />
        </Link>
        <div
          title="Open cases by rule rating"
          className="flex min-w-0 flex-auto items-center justify-center gap-2.5 overflow-hidden text-xs whitespace-nowrap text-indigo-20 tabular-nums"
        >
          {levels.map((level) => (
            <span key={level} className="flex items-center gap-[5px]">
              <span className={dot({ level })} />
              {openByRating ? (
                <b className="text-white">{openByRating[level]}</b>
              ) : (
                <span aria-hidden className="h-3 w-7 animate-pulse rounded-sm bg-white/15" />
              )}{" "}
              {level}
            </span>
          ))}
        </div>
      </div>

      <form
        className="relative m-0 flex min-w-[200px] flex-[0_1_420px] items-center"
        onSubmit={(e) => {
          e.preventDefault();
          const id = value.trim().toUpperCase();
          if (!id) return;
          void onJump(id).then((found) => (found ? setValue("") : setMiss(true)));
        }}
      >
        <span className="pointer-events-none absolute left-2.5 font-bold text-yellow">→</span>
        <input
          ref={input}
          aria-label="Open transaction by ID"
          placeholder="Open transaction by ID"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMiss(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setMiss(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setValue("");
              e.currentTarget.blur();
            }
          }}
          className="h-7 w-full rounded-md border border-indigo-80 bg-header-input pr-16 pl-7 font-mono text-[13px] text-white outline-none focus:border-yellow focus:bg-header-input-focus"
        />
        <span className={hint({ miss })}>
          {miss ? "Not found" : focused ? "Enter" : `${modKey}K`}
        </span>
      </form>

      <div className="flex flex-1 items-center justify-end gap-2 whitespace-nowrap">
        <button
          type="button"
          aria-label="Data import"
          title="Data import"
          aria-pressed={page === "import"}
          onClick={() => onTogglePage("import")}
          className={pageButton({ active: page === "import" })}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Rules"
          title="Rules"
          aria-pressed={page === "rules"}
          onClick={() => onTogglePage("rules")}
          className={cn(pageButton({ active: page === "rules" }), "mr-1")}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <UserMenu user={user} users={users} onUser={onUser} />
      </div>
    </header>
  );
}
