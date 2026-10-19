import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/render";

import { RatingBadge } from "./RatingBadge";

describe("RatingBadge", () => {
  it("says when the AI rating differs", () => {
    render(<RatingBadge rule="High" ai={{ rating: "Medium" }} />);
    expect(screen.getByTitle("Rule rating High · AI rating Medium (differs)")).toBeTruthy();
    expect(screen.getByText("AI")).toBeTruthy();
  });

  it("says when it matches", () => {
    render(<RatingBadge rule="High" ai={{ rating: "High" }} />);
    expect(screen.getByTitle("Rule rating High · AI rating High (matches)")).toBeTruthy();
  });

  it("shows the rule rating alone until the AI rating exists", () => {
    render(<RatingBadge rule="High" ai="none" />);
    expect(screen.getByTitle("Rule rating High · AI rating not generated yet")).toBeTruthy();
    expect(screen.queryByText("AI")).toBeNull();
  });
});
