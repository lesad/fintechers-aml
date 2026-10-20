import { cva } from "class-variance-authority";

import { cn } from "@/utils";

import type { ReactNode } from "react";

const tab = cva("flex flex-none cursor-pointer items-center gap-2 border-r border-border", {
  variants: {
    active: {
      true: "bg-bg text-fg shadow-[inset_0_2px_0_var(--color-yellow)]",
      false: "text-fg-muted",
    },
    closable: { true: "min-w-[150px] pr-1.5 pl-3", false: "px-3.5" },
  },
});

export function Tabs({ children }: { children: ReactNode }) {
  return (
    <nav
      role="tablist"
      className="flex h-[34px] flex-none items-stretch print:hidden overflow-x-auto overflow-y-hidden bg-bg-sub shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none]"
    >
      {children}
    </nav>
  );
}

type TabProps = {
  active: boolean;
  onSelect: () => void;
  /** Makes the tab closable: a × button and middle click. */
  onClose?: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
};

export function Tab({ active, onSelect, onClose, title, className, children }: TabProps) {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={title}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onAuxClick={(e) => {
        if (e.button === 1 && onClose) onClose();
      }}
      className={cn(tab({ active, closable: !!onClose }), className)}
    >
      {children}
      {onClose && (
        <button
          type="button"
          aria-label="Close tab"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-auto flex size-5 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-sm leading-none text-fg-subtle hover:bg-border-soft hover:text-fg"
        >
          ×
        </button>
      )}
    </div>
  );
}
