import { cva } from "class-variance-authority";
import { useEffect, useId, useRef, useState } from "react";

import { fetchVocabulary, type Vocabulary } from "./api";
import { type Candidate, complete, NO_VOCABULARY } from "./completion";

import type { ChangeEvent, KeyboardEvent, ReactNode, RefObject } from "react";

type Field = HTMLInputElement & HTMLTextAreaElement;

/** What a field spreads onto its `<input>` or `<textarea>` to take part in the completion. */
export type CompletionProps = {
  ref: RefObject<Field | null>;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onBlur: () => void;
  onMouseDown: () => void;
  role: "combobox";
  "aria-autocomplete": "list";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-activedescendant": string | undefined;
};

type CompletionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  names: Candidate[];
  values: Vocabulary["values"];
  children: (props: CompletionProps) => ReactNode;
};

/** Keys that move the caret away from the completed word. */
const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

const option = cva("flex cursor-pointer items-baseline justify-between gap-4 px-2.5 py-1", {
  variants: { active: { true: "bg-sel", false: "hover:bg-hover" } },
});

/**
 * Offers names and values while typing CEL in its child field: ↑/↓ choose, Enter or Tab insert, Escape closes.
 *
 * @remarks Renders the list beside the child with no wrapper, so the caller places both in a `relative` box.
 */
export function CompletionField({
  value,
  onChange,
  names,
  values,
  children,
}: CompletionFieldProps) {
  const ref = useRef<Field>(null);
  const id = useId();
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const completion = caret === null ? null : complete(value, caret, { names, values });
  const open = completion !== null;

  const accept = (c: Candidate) => {
    if (!completion) return;
    const insert = c.label + completion.suffix;
    onChange(value.slice(0, completion.from) + insert + value.slice(completion.to));
    setCaret(null);
    const at = completion.from + insert.length;
    // NOTE: the controlled field moves its caret to the end on re-render; put it back after the insert.
    requestAnimationFrame(() => ref.current?.setSelectionRange(at, at));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!completion) return;
    const count = completion.candidates.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const chosen = completion.candidates[Math.min(active, count - 1)];
      if (chosen) accept(chosen);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCaret(null);
    } else if (CARET_KEYS.has(e.key)) {
      setCaret(null);
    }
  };

  return (
    <>
      {children({
        ref,
        value,
        onChange: (e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart);
          setActive(0);
        },
        onKeyDown,
        onBlur: () => setCaret(null),
        onMouseDown: () => setCaret(null),
        role: "combobox",
        "aria-autocomplete": "list",
        "aria-expanded": open,
        "aria-controls": id,
        "aria-activedescendant": open ? `${id}-${active}` : undefined,
      })}
      {completion && (
        <ul
          id={id}
          role="listbox"
          className="absolute top-full left-0 z-20 mt-1 max-w-[min(100%,420px)] min-w-56 overflow-hidden rounded-md border border-border bg-bg py-1 font-mono text-xs text-fg shadow-card"
        >
          {completion.candidates.map((c, i) => (
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the field keeps focus and handles the keys
            <li
              key={c.label}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              // NOTE: mousedown, not click: preventing it keeps the focus (and the caret) in the field.
              onMouseDown={(e) => {
                e.preventDefault();
                accept(c);
              }}
              className={option({ active: i === active })}
            >
              <span className="font-semibold">{c.label}</span>
              <span className="text-[11px] text-fg-subtle">{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The engine's vocabulary for the editor; empty until it arrives, and empty for good when it fails. */
export function useVocabulary(): Vocabulary {
  const [vocabulary, setVocabulary] = useState(NO_VOCABULARY);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchVocabulary(ctrl.signal)
      .then(setVocabulary)
      // NOTE: completion is an aid; without the vocabulary the fields still offer variables and parameters.
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return vocabulary;
}
