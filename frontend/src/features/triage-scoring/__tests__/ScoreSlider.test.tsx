import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { ScoreSlider } from "../ScoreSlider";
import { CONFIG } from "./fixtures";

const BANDS = CONFIG.payload.bands;

const slider = () => screen.getByRole("slider", { name: "Score for A1" });

describe("ScoreSlider", () => {
  it("reports every move, because the page holds the draft and nothing is sent yet", () => {
    const onChange = vi.fn();
    render(<ScoreSlider ruleKey="A1" bands={BANDS} value={8} scored onChange={onChange} />);
    fireEvent.change(slider(), { target: { value: "30" } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(30);
  });

  it("shows the score it is given, so the page is the one source of truth", () => {
    const { rerender } = render(
      <ScoreSlider ruleKey="A1" bands={BANDS} value={8} scored onChange={() => {}} />,
    );
    expect(slider()).toHaveValue("8");
    rerender(<ScoreSlider ruleKey="A1" bands={BANDS} value={30} scored onChange={() => {}} />);
    expect(slider()).toHaveValue("30");
  });

  it("says an unscored rule's position is only the fallback", () => {
    render(
      <ScoreSlider ruleKey="A1" bands={BANDS} value={70} scored={false} onChange={() => {}} />,
    );
    expect(slider()).toHaveAttribute("aria-valuetext", "not set, uses 70");
  });
});
