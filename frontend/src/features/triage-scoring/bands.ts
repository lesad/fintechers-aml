import type { Band, Disposition } from "./api";

/** The legend name above a band's segment. */
export const BAND_LABEL: Record<Disposition, string> = {
  AUTO_CLOSE: "Auto-close",
  REVIEW_LOW: "Low",
  REVIEW_MEDIUM: "Medium",
  REVIEW_HIGH: "High",
  ESCALATE: "Escalate",
};

/** What a score alone means, as the row badge and the no-score callout say it. */
export const BAND_OUTCOME: Record<Disposition, string> = {
  AUTO_CLOSE: "Auto-close",
  REVIEW_LOW: "Low review",
  REVIEW_MEDIUM: "Medium review",
  REVIEW_HIGH: "High review",
  ESCALATE: "Escalate",
};

/** A band widened into the stretch of the scale it covers, with that stretch as a share of the whole. */
export type Segment = {
  disposition: Disposition;
  /** Inclusive. */
  from: number;
  /** Inclusive — the band's `maxScore`. */
  to: number;
  /** How many scores the band covers. Used as a flex weight, so the segments share the track in proportion. */
  width: number;
};

/** The top of the scale: the last band's `maxScore`, or 100 when the config has no bands. */
export const topScore = (bands: Band[]) => bands.at(-1)?.maxScore ?? 100;

/**
 * The bands as segments of the track. A band runs from one past the previous band's `maxScore` to its own, so the
 * segments tile the scale without a gap, and each is weighted by how many scores it covers — the design lays the
 * track out with `flex: <that count>` rather than percentages, which keeps the 2px gaps out of the arithmetic.
 */
export function segmentsOf(bands: Band[]): Segment[] {
  let from = 0;
  return bands.map((band) => {
    const segment: Segment = {
      disposition: band.disposition,
      from,
      to: band.maxScore,
      width: band.maxScore - from + 1,
    };
    from = band.maxScore + 1;
    return segment;
  });
}

/** The band a score falls into: the first whose `maxScore` it does not exceed, else the last. */
export function bandOf(bands: Band[], score: number): Disposition | null {
  return bands.find((b) => score <= b.maxScore)?.disposition ?? bands.at(-1)?.disposition ?? null;
}

/**
 * The ticks under the track: `bands.length` even steps from 0 to the top of the scale — five bands over 0..100
 * give 0, 20, 40, 60, 80, 100. A tick is a reading aid for the numbers, not a band boundary.
 */
export function ticksOf(bands: Band[]): number[] {
  const top = topScore(bands);
  const steps = Math.max(bands.length, 1);
  return Array.from({ length: steps + 1 }, (_, i) => Math.round((top / steps) * i));
}

/** `["A3", "C1"]` → "A3 and C1"; `["A1", "A3", "C1"]` → "A1, A3 and C1". */
export function listKeys(keys: string[]): string {
  if (keys.length < 2) return keys[0] ?? "";
  return `${keys.slice(0, -1).join(", ")} and ${keys.at(-1)}`;
}
