import { cva } from "class-variance-authority";

import { BAND_LABEL, segmentsOf, ticksOf, topScore } from "./bands";

import type { Band, Disposition } from "./api";

/**
 * A band is drawn in three different strengths, per the design's `BANDS` table: a saturated bar under the legend
 * label, a much lighter tint for the row tracks, and a background/foreground pair for the row's pill.
 */

/** The 4px saturated bar in the header legend. */
export const legendBar = cva("h-1 rounded-sm", {
  variants: {
    disposition: {
      AUTO_CLOSE: "bg-retired-dot",
      REVIEW_LOW: "bg-low-dot",
      REVIEW_MEDIUM: "bg-med-dot",
      REVIEW_HIGH: "bg-high-dot",
      ESCALATE: "bg-indigo",
    } satisfies Record<Disposition, string>,
  },
});

/** The legend's band name, in its band's darkest tone. */
export const legendLabel = cva(
  "overflow-hidden text-center text-[11px] font-semibold text-ellipsis whitespace-nowrap",
  {
    variants: {
      disposition: {
        AUTO_CLOSE: "text-fg-subtle",
        REVIEW_LOW: "text-low",
        REVIEW_MEDIUM: "text-med",
        REVIEW_HIGH: "text-high",
        ESCALATE: "text-indigo",
      } satisfies Record<Disposition, string>,
    },
  },
);

/** The 6px track behind a row's slider — the design's lightest tint of each band, as `*-track` tokens. */
export const trackFill = cva("rounded-[3px]", {
  variants: {
    disposition: {
      AUTO_CLOSE: "bg-auto-track",
      REVIEW_LOW: "bg-low-track",
      REVIEW_MEDIUM: "bg-med-track",
      REVIEW_HIGH: "bg-high-track",
      ESCALATE: "bg-escalate-track",
    } satisfies Record<Disposition, string>,
  },
});

/** The row's "Alone, it means" pill. `unset` is the design's own case: the med pair, for a rule with no score. */
export const bandPill = cva(
  "inline-flex h-[22px] items-center rounded px-2 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      disposition: {
        // The design's #ececf0 has no token; border-soft (#e8e8ed) is the nearest.
        AUTO_CLOSE: "bg-border-soft text-fg-muted",
        REVIEW_LOW: "bg-low-bg text-low",
        REVIEW_MEDIUM: "bg-med-bg text-med",
        REVIEW_HIGH: "bg-high-bg text-high",
        ESCALATE: "bg-indigo text-yellow",
      } satisfies Record<Disposition, string>,
      unset: { true: "bg-med-bg text-med" },
    },
  },
);

/** The band names over their stretch of the scale, with the numbers under it. */
export function BandLegend({ bands }: { bands: Band[] }) {
  const segments = segmentsOf(bands);
  const top = topScore(bands);

  return (
    <span className="flex flex-col gap-1">
      <span className="flex gap-[2px]">
        {segments.map((s) => (
          <span
            key={s.disposition}
            style={{ flex: s.width }}
            className="flex min-w-0 flex-col gap-[3px]"
            title={`${BAND_LABEL[s.disposition]}: ${s.from}–${s.to}`}
          >
            <span className={legendLabel({ disposition: s.disposition })}>
              {BAND_LABEL[s.disposition]}
            </span>
            <span className={legendBar({ disposition: s.disposition })} />
          </span>
        ))}
      </span>
      {/* The 8px side margins match the thumb's inset, so a tick sits over the score it names. */}
      <span className="relative mx-2 block h-3 font-mono text-[10px] font-normal text-fg-subtle">
        {ticksOf(bands).map((tick) => (
          <span
            key={tick}
            style={{ left: top > 0 ? `${(tick / top) * 100}%` : "0%" }}
            className="absolute -translate-x-1/2"
          >
            {tick}
          </span>
        ))}
      </span>
    </span>
  );
}
