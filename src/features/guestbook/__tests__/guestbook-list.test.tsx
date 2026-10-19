import { describe, expect, it } from "vitest";

import { renderWithIntl, screen, messages } from "@/test/render";

import { GuestbookList } from "../guestbook-list";

import type { GuestbookEntry } from "../queries";

const entry: GuestbookEntry = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Ada",
  message: "Hello",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const renderList = (entries: GuestbookEntry[]) =>
  renderWithIntl(<GuestbookList entries={entries} />);

describe("GuestbookList", () => {
  it("renders each entry's name and message", () => {
    renderList([entry]);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows the empty state when there are no entries", () => {
    renderList([]);
    expect(screen.getByText(messages.guestbook.empty)).toBeInTheDocument();
  });
});
