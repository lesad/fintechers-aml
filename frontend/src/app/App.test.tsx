import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/render";

import { App } from "./App";

// Role queries skip hidden detail tabs, so this is always the visible table.
const queueTable = () => screen.getByRole("table");

describe("App", () => {
  it("opens a queue row as a detail tab and returns to the queue when the tab closes", () => {
    render(<App />);
    expect(within(queueTable()).getAllByRole("row")).toHaveLength(13); // header + 12 mock rows

    fireEvent.click(screen.getByText("TX000123456"));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("TX000123456");
    expect(screen.getByText("PEP outgoing payment")).toBeInTheDocument();
    expect(screen.getByText("Client's recent transactions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close tab" }));
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Review queue");
    expect(screen.queryByText("PEP outgoing payment")).not.toBeInTheDocument();
  });

  it("needs a reason before closing a case, then shows the decision in the queue", () => {
    render(<App />);
    fireEvent.click(screen.getByText("TX000004888"));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const submit = screen.getByRole("button", { name: "Close transaction" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Why the transaction is not suspicious"), {
      target: { value: "Payroll run, confirmed with the client." },
    });
    fireEvent.click(submit);
    expect(screen.getByText("Payroll run, confirmed with the client.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Review queue/ }));
    const row = within(queueTable()).getByText("TX000004888").closest("tr");
    expect(row).toHaveTextContent("Closed");
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
