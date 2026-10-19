import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/render";

import { App } from "./App";

describe("App", () => {
  it("opens a queue row in a tab and returns to the queue when the tab closes", () => {
    render(<App />);
    expect(screen.getAllByRole("row")).toHaveLength(13); // header + 12 mock rows

    fireEvent.click(screen.getByText("TX000123456"));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("TX000123456");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close tab" }));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Review queue");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("opens a transaction typed into the header and flags unknown ids", () => {
    render(<App />);
    const jump = screen.getByRole("textbox", { name: "Open transaction by ID" });

    fireEvent.change(jump, { target: { value: "tx999" } });
    fireEvent.submit(jump);
    expect(screen.getByText("Not found")).toBeInTheDocument();

    fireEvent.change(jump, { target: { value: "tx000004790" } });
    fireEvent.submit(jump);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("TX000004790");
  });
});
