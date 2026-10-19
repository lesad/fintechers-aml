import { cva } from "class-variance-authority";
import { useEffect, useRef, useState } from "react";

import { CURRENT_USER } from "./user";

import type { RiskLevel } from "@/components";

type HeaderProps = {
  openByRating: Record<RiskLevel, number>;
  /** Opens the transaction if it exists; resolves to false when the id is unknown. */
  onJump: (id: string) => Promise<boolean>;
  rulesOpen: boolean;
  onToggleRules: () => void;
};

const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";

const levels: RiskLevel[] = ["High", "Medium", "Low"];

// Brighter risk colours that read on the indigo bar.
const dot = cva("size-[7px] rounded-[2px]", {
  variants: {
    level: { High: "bg-header-high", Medium: "bg-header-med", Low: "bg-header-low" },
  },
});

const cog = cva(
  "flex size-7 items-center justify-center rounded-md text-base leading-none outline-none focus-visible:ring-2 focus-visible:ring-yellow",
  {
    variants: {
      active: {
        true: "bg-white/15 text-yellow shadow-[inset_0_-2px_0_var(--color-yellow)]",
        false: "text-indigo-20 hover:bg-white/10 hover:text-white",
      },
    },
  },
);

const hint = cva("pointer-events-none absolute right-2 text-[11px]", {
  variants: { miss: { true: "text-header-miss", false: "text-indigo-60" } },
});

export function Header({ openByRating, onJump, rulesOpen, onToggleRules }: HeaderProps) {
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
        <img
          src="/aml-spotter-logo-white.png"
          alt="AML spotter"
          className="block h-7 w-auto flex-none"
        />
        <div
          title="Open cases by rule rating"
          className="flex min-w-0 flex-auto items-center justify-center gap-2.5 overflow-hidden text-xs whitespace-nowrap text-indigo-20 tabular-nums"
        >
          {levels.map((level) => (
            <span key={level} className="flex items-center gap-[5px]">
              <span className={dot({ level })} />
              <b className="text-white">{openByRating[level]}</b> {level}
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
          aria-label="Rules"
          title="Rules"
          aria-pressed={rulesOpen}
          onClick={onToggleRules}
          className={cog({ active: rulesOpen })}
        >
          ⚙
        </button>
        <span className="text-xs text-indigo-20">{CURRENT_USER}</span>
        <div className="flex size-[26px] items-center justify-center rounded-full bg-indigo-80 text-[11px] font-semibold">
          JN
        </div>
      </div>
    </header>
  );
}
