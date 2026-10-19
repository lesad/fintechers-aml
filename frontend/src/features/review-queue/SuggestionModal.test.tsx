import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { SuggestionModal } from "./SuggestionModal";

import type { Suggestion } from "./api";

const ruleVersion: Suggestion = {
  kind: "rule_version",
  explanation: [{ text: "The reviewer says it is payroll.", refs: ["reason", "rule:C1"] }],
  rule: {
    key: "C1-K2",
    version: 1,
    name: "Flow-through: inflow forwarded within hours (client K2)",
    alertType: "C",
    layer: "client",
    scopeSegmentId: null,
    scopeClientId: "K2",
    grain: "client_anchor",
    anchor: 'tx.direction == "in"',
    condition: "inflow > p.min_inflow && outflow * 100 >= p.forward_pct * inflow",
    replacesKey: "C1",
    variables: [
      {
        name: "inflow",
        agg: "sum",
        field: "amount",
        filter: 'tx.direction == "in"',
        window: { kind: "relative", from: "-PT24H", to: "PT0S" },
      },
    ],
    params: {
      min_inflow: { value: 200_000, unit: "amount" },
      forward_pct: { value: 80, unit: "percent" },
    },
  },
  previousParams: {
    min_inflow: { value: 100_000, unit: "amount" },
    forward_pct: { value: 80, unit: "percent" },
  },
  retires: null,
  ruleExplanation: "Flags money passed on within hours of arriving, for this client only.",
  impact: {
    stopsThisAlert: true,
    closesThisAlert: true,
    client: {
      hitsStopped: 3,
      hitsAdded: 0,
      alertsClosed: 2,
      closedByDisposition: { REVIEW_LOW: 2 },
    },
    company: null,
  },
  declined: null,
};

const accept = async () => {};

describe("SuggestionModal", () => {
  it("shows one AI card, the measured effect and the rule under details", () => {
    render(<SuggestionModal suggestion={ruleVersion} onClose={() => {}} onAccept={accept} />);

    expect(screen.getByText("Suggested rule change")).toBeInTheDocument();
    expect(screen.getByText("The reviewer says it is payroll.")).toBeInTheDocument();
    expect(
      screen.getByText("Flags money passed on within hours of arriving, for this client only."),
    ).toBeInTheDocument();
    expect(screen.getByText("Closes this alert.")).toBeInTheDocument();
    expect(
      screen.getByText(/This client: stops 3 hits, closes 2 other alerts \(2 low\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("C1-K2 v1 (draft)")).toBeInTheDocument();
    const changed = screen.getByText("min_inflow").closest("tr");
    expect(changed).toHaveTextContent("100,000 CZK");
    expect(changed).toHaveTextContent("200,000 CZK");
    expect(
      screen.getByText("Flow-through: inflow forwarded within hours (client K2)"),
    ).toBeInTheDocument();
  });

  it("leads with the reason when code declines the draft", () => {
    const declined: Suggestion = {
      ...ruleVersion,
      kind: "none",
      declined: "The change would also close 1 other alerts that triage rated high or escalated.",
    };
    render(<SuggestionModal suggestion={declined} onClose={() => {}} onAccept={accept} />);
    expect(screen.getByText("No rule change suggested")).toBeInTheDocument();
    expect(screen.getByText(/triage rated high/)).toBeInTheDocument();
    expect(screen.getByText("What the model proposed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("accepts the suggested rule", async () => {
    const onAccept = vi.fn(async () => {});
    render(<SuggestionModal suggestion={ruleVersion} onClose={() => {}} onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith(ruleVersion.rule);
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("shows the engine's reason when saving fails, and lets the reviewer try again", async () => {
    const onAccept = vi.fn(async () => {
      throw new Error("rule C1-K2 already exists");
    });
    render(<SuggestionModal suggestion={ruleVersion} onClose={() => {}} onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save the draft: rule C1-K2 already exists",
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    render(<SuggestionModal suggestion={ruleVersion} onClose={onClose} onAccept={accept} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
