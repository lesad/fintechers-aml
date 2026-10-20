import { cva } from "class-variance-authority";

import { trackFill } from "./BandLegend";
import { segmentsOf, topScore } from "./bands";

import type { Band } from "./api";

/** The thumb is 16px wide, so the usable travel is the track less one thumb, inset half a thumb at each end. */
const THUMB = 16;

type ScoreSliderProps = {
  ruleKey: string;
  bands: Band[];
  /** The score to show: the draft one if the user moved it, else the stored one or the config's fallback. */
  value: number;
  /** An unscored rule: the whole control is faded, because the score shown is only the fallback. */
  scored: boolean;
  disabled?: boolean;
  /**
   * A hairline on the track at this score, showing where the thumb was before the user moved it. Only a changed
   * row passes one; null leaves the track unmarked.
   */
  markAt?: number | null;
  /** Every move. Nothing is sent to the engine here — the page holds the draft until the user saves. */
  onChange: (score: number) => void;
};

const wrapper = cva("relative block h-6", {
  variants: { scored: { false: "opacity-45" } },
});

/**
 * The thumb is drawn by the range input's own pseudo-elements — both vendor spellings, because neither engine
 * accepts the other's selector in the same rule. White with an indigo rim, as the design has it.
 */
const thumb = [
  "[&::-webkit-slider-runnable-track]:h-6 [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:mt-1 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none",
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2",
  "[&::-webkit-slider-thumb]:border-indigo [&::-webkit-slider-thumb]:bg-bg [&::-webkit-slider-thumb]:shadow-sm",
  "[&::-moz-range-track]:h-6 [&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full",
  "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-indigo [&::-moz-range-thumb]:bg-bg",
  "[&::-moz-range-thumb]:shadow-sm",
].join(" ");

const input = cva(
  `relative m-0 block h-6 w-full cursor-pointer appearance-none bg-transparent
   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple ${thumb}`,
  { variants: { disabled: { true: "cursor-progress" } } },
);

/**
 * The score on a band-coloured track. A plain controlled input: the page owns the value, and a move costs nothing
 * but a re-render, so there is no reason to wait for the interaction to settle.
 */
export function ScoreSlider({
  ruleKey,
  bands,
  value,
  scored,
  disabled,
  markAt,
  onChange,
}: ScoreSliderProps) {
  const top = topScore(bands);

  return (
    <span className={wrapper({ scored })}>
      <span className="pointer-events-none absolute inset-x-0 top-[9px] flex h-1.5 gap-[2px]">
        {segmentsOf(bands).map((s) => (
          <span
            key={s.disposition}
            style={{ flex: s.width }}
            className={trackFill({ disposition: s.disposition })}
          />
        ))}
      </span>
      {markAt != null && top > 0 && (
        // Where the score was before this edit. The offset follows the thumb's travel rather than the raw width,
        // so the mark lines up with where the thumb actually sat; `pointer-events-none` keeps the input draggable.
        <span
          aria-hidden="true"
          title={`Saved value ${markAt}`}
          style={{ left: `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${markAt / top})` }}
          className="pointer-events-none absolute top-[5px] -ml-px h-3.5 w-0.5 rounded-[1px] bg-indigo opacity-45"
        />
      )}
      <input
        type="range"
        min={0}
        max={top}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={`Score for ${ruleKey}`}
        aria-valuetext={scored ? `${value}` : `not set, uses ${value}`}
        className={input({ disabled })}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </span>
  );
}
