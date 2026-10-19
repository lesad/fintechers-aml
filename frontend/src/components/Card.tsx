import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/utils";

import type { ReactNode } from "react";

const card = cva("flex flex-col rounded-lg", {
  variants: {
    tone: {
      plain: "bg-bg",
      /** AI output: a light purple gradient sets it apart from rule facts. */
      ai: "bg-[linear-gradient(135deg,var(--color-ai-from)_0%,var(--color-ai-to)_100%)]",
    },
    /** Lifted off the page, for the sticky side column. */
    raised: { true: "shadow-card" },
    padded: { true: "gap-2.5 px-3.5 py-3", false: "overflow-hidden" },
  },
  defaultVariants: { tone: "plain", padded: true },
});

const head = cva("flex flex-wrap items-center gap-2.5", {
  variants: { padded: { true: "", false: "px-3.5 pt-2.5 pb-2" } },
  defaultVariants: { padded: true },
});

const title = cva("text-xs font-semibold", {
  variants: { tone: { plain: "text-fg-muted", ai: "text-ai-fg" } },
  defaultVariants: { tone: "plain" },
});

type CardProps = VariantProps<typeof card> & {
  title?: ReactNode;
  /** Right of the title: counts, legends. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Card({
  tone,
  raised,
  padded,
  title: heading,
  aside,
  className,
  children,
}: CardProps) {
  return (
    <section className={cn(card({ tone, raised, padded }), className)}>
      {(heading || aside) && (
        <div className={head({ padded })}>
          {heading && <span className={title({ tone })}>{heading}</span>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
