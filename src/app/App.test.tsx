import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/render";

import { App } from "./App";

describe("App", () => {
  it("renders the title, subtitle, and CTA", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "fintechers-aml" })).toBeInTheDocument();
    expect(screen.getByText(/AML transaction monitoring/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
  });
});
