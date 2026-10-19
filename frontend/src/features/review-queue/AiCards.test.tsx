import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { AiRatingCard } from "./AiRatingCard";

const envelope = (kind: string, status: string, body: unknown, error: string | null = null) => ({
  alertId: 7,
  kind,
  status,
  body,
  error,
  modelId: "fake-model",
  promptHash: "p",
  inputHash: "i",
  createdAt: "2026-10-19T10:00:00Z",
});

const assessment = {
  rating: "high",
  verdict: "pass_through",
  summary: [{ text: "CZK 110,000 came in and left the same day.", refs: ["rule:C1"] }],
  openPoints: [
    {
      question: { text: "What is the source of the incoming funds?", refs: ["rule:C1"] },
      suspicious: "The money left within hours.",
      normal: "A customer payment passed on to a supplier.",
      wouldSettle: "The invoice for the outgoing payment.",
      askWho: "client",
    },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let replies: Record<string, Response | Promise<Response>>;

beforeEach(() => {
  replies = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string, init?: RequestInit) =>
        replies[`${init?.method ?? "GET"} ${url}`] ?? json({}, 404),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("AI Rating card", () => {
  it("generates on open when nothing is stored, then shows rating, verdict, summary and open points", async () => {
    let finish!: (res: Response) => void;
    replies["POST /api/alerts/7/assessment"] = new Promise((resolve) => (finish = resolve));
    render(<AiRatingCard alertId={7} ruleRating="High" />);

    expect(await screen.findByText("Assessment in progress…")).toBeInTheDocument();
    finish(json(envelope("assessment", "ready", assessment)));
    expect(await screen.findByText("High")).toBeInTheDocument();
    expect(screen.getByText("Pass-through")).toBeInTheDocument();
    expect(screen.getByText("CZK 110,000 came in and left the same day.")).toBeInTheDocument();
    expect(screen.getByText("Open points")).toBeInTheDocument();
    expect(screen.getByText("What is the source of the incoming funds?")).toBeInTheDocument();
    expect(screen.getByText("Suspicious: The money left within hours.")).toBeInTheDocument();
    expect(screen.getByText("Ask: Client")).toBeInTheDocument();
  });

  it("marks a rating above the rule rating", async () => {
    replies["GET /api/alerts/7/assessment"] = json(envelope("assessment", "ready", assessment));
    render(<AiRatingCard alertId={7} ruleRating="Medium" />);

    expect(await screen.findByText("≠ higher than rule")).toBeInTheDocument();
  });

  it("shows no difference badge when they match", async () => {
    replies["GET /api/alerts/7/assessment"] = json(envelope("assessment", "ready", assessment));
    render(<AiRatingCard alertId={7} ruleRating="High" />);

    expect(await screen.findByText("Pass-through")).toBeInTheDocument();
    expect(screen.queryByText(/≠/)).not.toBeInTheDocument();
  });

  it("shows a rejected result with its reason and a retry that replaces it", async () => {
    replies["GET /api/alerts/7/assessment"] = json(
      envelope("assessment", "rejected", null, "summary[0] cites unknown refs [hit:9]"),
    );
    render(<AiRatingCard alertId={7} ruleRating="High" />);

    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("summary[0] cites unknown refs [hit:9]")).toBeInTheDocument();

    replies["POST /api/alerts/7/assessment"] = json(envelope("assessment", "ready", assessment));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Pass-through")).toBeInTheDocument();
    expect(screen.getAllByText("rule:C1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
  });

  it("shows the design's copy and a retry when the model failed", async () => {
    replies["GET /api/alerts/7/assessment"] = json(
      envelope("assessment", "failed", null, "Unable to load credentials"),
    );
    render(<AiRatingCard alertId={7} ruleRating="High" />);

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(
      screen.getByText(/The AI assessment could not be completed for this transaction/),
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to load credentials")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
