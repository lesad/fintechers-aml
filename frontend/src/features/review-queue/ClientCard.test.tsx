import { within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/render";

import { ClientCard } from "./ClientCard";

import type { DetailClient } from "./api";

const client: DetailClient = {
  id: "K1",
  country: "CZ",
  contractDate: "2024-01-01",
  channel: "online",
  pep: false,
  type: "individual",
  risk: "low",
  expectedMonthly: 400_000,
  expectedCount: 50,
  q2Volume: 1_500_000,
  q2TxCount: 120,
  q2MaxTx: 61_400,
  q2Days: 91,
};

describe("ClientCard", () => {
  it("compares Q2 volume and Q2 transactions with the expected quarter, each in its own section", () => {
    render(<ClientCard client={client} />);
    const volume = screen.getByRole("group", { name: "Volume, Q2 2026" });
    expect(volume).toHaveTextContent("+25 % vs expected");
    expect(volume).toHaveTextContent("Expected1,200,000");
    expect(volume).toHaveTextContent("Real1,500,000");

    const count = screen.getByRole("group", { name: "Transactions, Q2 2026" });
    expect(count).toHaveTextContent("-20 % vs expected");
    expect(within(count).getByText("150")).toBeInTheDocument();
    expect(within(count).getByText("120")).toBeInTheDocument();
  });

  it("drops the per-month footnote", () => {
    render(<ClientCard client={client} />);
    expect(screen.queryByText(/\/ month/)).not.toBeInTheDocument();
  });

  it("without Q2 history shows only what was expected", () => {
    render(<ClientCard client={{ ...client, q2Volume: 0, q2TxCount: 0 }} />);
    const count = screen.getByRole("group", { name: "Transactions, Q2 2026" });
    expect(count).toHaveTextContent("No Q2 history");
    expect(count).not.toHaveTextContent("Real");
  });
});
