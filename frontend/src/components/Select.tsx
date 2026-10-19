import { cn } from "@/utils";

import type { ComponentProps } from "react";

/** Native select with our own chevron: the browser's arrow sits flush against the border. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        {...props}
        className="h-7 w-full cursor-pointer appearance-none rounded border border-border bg-bg pr-7 pl-2 text-[13px] text-fg outline-none focus:border-purple focus:ring-2 focus:ring-purple/25"
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 10 6"
        className="pointer-events-none absolute top-1/2 right-2.5 h-1.5 w-2.5 -translate-y-1/2 text-fg-muted"
      >
        <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}
