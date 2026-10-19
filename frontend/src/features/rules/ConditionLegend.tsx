import { cva } from "class-variance-authority";

import type { TokenKind } from "./format";

/** Colour of a condition token on the indigo code block; `unknown` adds a wavy underline. */
export const token = cva("", {
  variants: {
    kind: {
      param: "font-bold text-yellow",
      variable: "font-bold text-ai-line",
      field: "text-white",
      constant: "text-code-constant",
      keyword: "text-code-keyword",
      plain: "text-indigo-20",
    } satisfies Record<TokenKind, string>,
    unknown: { true: "underline decoration-med-dot decoration-wavy", false: "" },
  },
  defaultVariants: { unknown: false },
});

const SWATCHES: [string, string][] = [
  ["parameter", "size-2 rounded-[2px] bg-yellow"],
  ["variable", "size-2 rounded-[2px] bg-ai-line"],
  ["data field", "size-2 rounded-[2px] border border-border bg-white"],
  ["constant", "size-2 rounded-[2px] bg-code-constant"],
];

export function ConditionLegend({ withUnknown = false }: { withUnknown?: boolean }) {
  const swatches: [string, string][] = withUnknown
    ? [...SWATCHES, ["unknown", "w-3 border-b-2 border-dotted border-med-dot"]]
    : SWATCHES;
  return (
    <div className="flex flex-wrap gap-4 text-xs text-fg-subtle">
      {swatches.map(([label, swatch]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={swatch} />
          {label}
        </span>
      ))}
    </div>
  );
}
