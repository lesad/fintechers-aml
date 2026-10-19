import { describe, expect, it } from "vitest";

import { renderWithIntl, screen, messages } from "@/test/render";

import GlobalNotFound from "./global-not-found";

describe("GlobalNotFound", () => {
  it("renders the localized 404 title and description from the default locale", () => {
    renderWithIntl(<GlobalNotFound />);

    expect(
      screen.getByRole("heading", { name: messages.errors.notFound.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(messages.errors.notFound.description)).toBeInTheDocument();
  });
});
