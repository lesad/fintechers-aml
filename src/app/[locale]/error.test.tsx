import { describe, expect, it, vi } from "vitest";

import { renderWithIntl, screen, messages } from "@/test/render";

import ErrorBoundary from "./error";

describe("Error boundary", () => {
  it("renders the localized title, description, and retry button", () => {
    renderWithIntl(<ErrorBoundary error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: messages.errors.title })).toBeInTheDocument();
    expect(screen.getByText(messages.errors.description)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.errors.retry })).toBeInTheDocument();
  });
});
