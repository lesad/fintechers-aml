import { cva } from "class-variance-authority";

import { conditionTokens, type TokenKind } from "@/utils";

/** Colour of a condition token on the indigo code block; `unknown` adds a wavy underline. */
export const conditionToken = cva("", {
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

/** A CEL condition on the indigo code block, each token coloured by [conditionToken]. */
export function ConditionCode({
  condition,
  variables,
}: {
  condition: string;
  variables: Set<string>;
}) {
  return (
    <div className="overflow-x-auto rounded-md bg-indigo px-3 py-2.5 font-mono text-[13px] leading-[1.55] whitespace-pre-wrap">
      {conditionTokens(condition, variables).map((t) => (
        <span key={t.at} className={conditionToken({ kind: t.kind })}>
          {t.text}
        </span>
      ))}
    </div>
  );
}
