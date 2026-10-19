import { describe, expect, it, vi } from "vitest";

import { renderWithIntl, screen, messages } from "@/test/render";

import GlobalError from "./global-error";

describe("GlobalError", () => {
  // It ships its own default-locale provider, so it renders standalone.
  it("renders the localized global-error title from the default locale", () => {
    renderWithIntl(<GlobalError error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: messages.errors.global.title })).toBeInTheDocument();
    expect(screen.getByText(messages.errors.global.description)).toBeInTheDocument();
  });
});
