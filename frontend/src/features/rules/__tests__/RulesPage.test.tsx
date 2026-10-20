import { fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { RulesPage } from "../RulesPage";
import { B2_V2, json, SEEDED } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

const serve = (...responses: (() => Response)[]) => {
  const fetch = vi.fn(async () => (responses.shift() ?? (() => json(SEEDED)))());
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

const list = () => screen.findByRole("navigation", { name: "Rules" });
const open = async (key: RegExp) =>
  fireEvent.click(within(await list()).getByRole("button", { name: key }));

describe("RulesPage", () => {
  it("lists rules by alert type with their name, active version and draft", async () => {
    serve(() => json([...SEEDED, B2_V2]));
    render(<RulesPage author="J. Novák" manager={false} />);
    const nav = await list();
    expect(within(nav).getByText("Alert type A")).toBeInTheDocument();
    expect(within(nav).getByText("Alert type C")).toBeInTheDocument();
    const b2 = within(nav).getByRole("button", { name: /B2/ });
    expect(b2).toHaveTextContent("PEP outgoing payment above the limit");
    expect(b2).toHaveTextContent("v1 active");
    expect(b2).toHaveTextContent("draft v2");
  });

  it("opens the version named in ?rule=", async () => {
    serve(() => json([...SEEDED, B2_V2]));
    render(<RulesPage author="J. Novák" manager={false} />, { route: `/rules?rule=${B2_V2.id}` });
    expect(await screen.findByRole("region", { name: "B2 v2" })).toBeInTheDocument();
  });

  it("filters rules by key or name", async () => {
    serve();
    render(<RulesPage author="J. Novák" manager={false} />);
    const nav = await list();
    fireEvent.change(screen.getByPlaceholderText("Filter rules"), {
      target: { value: "flow-through" },
    });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining("C1")]);
    fireEvent.change(screen.getByPlaceholderText("Filter rules"), { target: { value: "zzz" } });
    expect(screen.getByText("No rules match “zzz”.")).toBeInTheDocument();
  });

  it("opens a rule on its active version with what it flags, condition and parameters", async () => {
    serve(() => json([...SEEDED, B2_V2]));
    render(<RulesPage author="J. Novák" manager={false} />);
    await open(/B2/);

    const detail = screen.getByRole("region", { name: "B2 v1" });
    expect(within(detail).getByRole("heading", { level: 1 })).toHaveTextContent(
      "PEP outgoing payment above the limit",
    );
    expect(detail).toHaveTextContent("Alert type B · Company-wide · Per transaction");
    expect(detail).toHaveTextContent("more than 100,000 CZK");
    expect(detail).toHaveTextContent("client.pep && tx.amount > p.pep_min");
    expect(detail).toHaveTextContent("100,000 CZK");
    expect(within(detail).getByRole("tab", { name: "v1 active" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("a draft shows how its parameters differ from the active version", async () => {
    serve(() => json([...SEEDED, B2_V2]));
    render(<RulesPage author="J. Novák" manager={false} />);
    await open(/B2/);
    fireEvent.click(screen.getByRole("tab", { name: "v2 draft" }));

    const detail = screen.getByRole("region", { name: "B2 v2" });
    expect(detail).toHaveTextContent("Draft — not evaluating transactions yet");
    expect(detail).toHaveTextContent("pep_min100,000 CZK→50,000 CZK");
  });

  it("shows a percentage parameter with its unit, not as CZK", async () => {
    serve();
    render(<RulesPage author="J. Novák" manager={false} />);
    await open(/C1/);
    expect(screen.getByRole("region", { name: "C1 v2" })).toHaveTextContent("forward_pct80 %");
  });

  it("a retired version says so and has no explanation yet", async () => {
    serve();
    render(<RulesPage author="J. Novák" manager={false} />);
    await open(/C1/);
    fireEvent.click(screen.getByRole("tab", { name: "v1 retired" }));

    const detail = screen.getByRole("region", { name: "C1 v1" });
    expect(detail).toHaveTextContent("Kept for audit of cases flagged while it was active");
    expect(detail).toHaveTextContent("No explanation yet");
    expect(detail).toHaveTextContent("relative · −24 h → 0 h");
  });

  it("shows an error with retry when the rules fail to load", async () => {
    const fetch = serve(() => json({}, 500));
    render(<RulesPage author="J. Novák" manager={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(within(await list()).getAllByRole("button")).not.toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sends a draft for approval and shows whom it waits for", async () => {
    const pending = { ...B2_V2, status: "pending" as const, assignee: "M. Svobodová" };
    const fetch = serve(
      () => json([...SEEDED, B2_V2]),
      () => json(pending),
    );
    render(<RulesPage author="J. Novák" manager={false} />, { route: `/rules?rule=${B2_V2.id}` });
    fireEvent.click(await screen.findByRole("button", { name: "Send for approval" }));

    const detail = await screen.findByText(/Waiting for approval by M. Svobodová/);
    expect(detail).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/rules/${B2_V2.id}/submit`, expect.anything());
    expect(screen.queryByRole("button", { name: /Edit draft/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });

  it("lets a manager approve a pending version", async () => {
    const pending = { ...B2_V2, status: "pending" as const, assignee: "M. Svobodová" };
    const fetch = serve(
      () => json([...SEEDED, pending]),
      () => json({ ...pending, status: "active", assignee: null, approver: "M. Svobodová" }),
    );
    render(<RulesPage author="M. Svobodová" manager />, { route: `/rules?rule=${B2_V2.id}` });
    fireEvent.click(await screen.findByRole("button", { name: "Approve v2" }));

    expect(await screen.findByRole("tab", { name: "v2 active" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/rules/${B2_V2.id}/approve`, expect.anything());
  });

  it("shows the engine's reason when an approval is refused", async () => {
    const pending = { ...B2_V2, status: "pending" as const, assignee: "M. Svobodová" };
    serve(
      () => json([...SEEDED, pending]),
      () => json({ detail: "only a manager can approve a rule" }, 403),
    );
    render(<RulesPage author="M. Svobodová" manager />, { route: `/rules?rule=${B2_V2.id}` });
    fireEvent.click(await screen.findByRole("button", { name: "Approve v2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("only a manager can approve a rule");
  });
});
