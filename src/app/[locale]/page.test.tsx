import { describe, expect, it } from "vitest";

import { renderWithIntl, screen, messages } from "@/test/render";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the localized title, subtitle, and CTA", () => {
    renderWithIntl(<HomePage />);

    expect(screen.getByRole("heading", { name: messages.home.title })).toBeInTheDocument();
    expect(screen.getByText(messages.home.subtitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.home.cta })).toBeInTheDocument();
  });
});
