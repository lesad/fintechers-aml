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

const ANALYST = { id: 1, name: "J. Novák", role: "ANALYST" } as const;
const OFFICER = { id: 2, name: "M. Svobodová", role: "COMPLIANCE_OFFICER" } as const;
const BOARD = { id: 3, name: "P. Dvořák", role: "COMPLIANCE_MANAGER" } as const;
const USERS = [ANALYST, OFFICER, BOARD];

const list = () => screen.findByRole("navigation", { name: "Rules" });
const open = async (key: RegExp) =>
  fireEvent.click(within(await list()).getByRole("button", { name: key }));

describe("RulesPage", () => {
  it("lists rules by alert type with their name, active version and draft", async () => {
    serve(() => json([...SEEDED, B2_V2]));
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
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
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    expect(await screen.findByRole("region", { name: "B2 v2" })).toBeInTheDocument();
  });

  it("filters rules by key or name", async () => {
    serve();
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
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
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
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
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
    await open(/B2/);
    fireEvent.click(screen.getByRole("tab", { name: "v2 draft" }));

    const detail = screen.getByRole("region", { name: "B2 v2" });
    expect(detail).toHaveTextContent("Draft — not evaluating transactions yet");
    expect(detail).toHaveTextContent("pep_min100,000 CZK→50,000 CZK");
  });

  it("shows a percentage parameter with its unit, not as CZK", async () => {
    serve();
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
    await open(/C1/);
    expect(screen.getByRole("region", { name: "C1 v2" })).toHaveTextContent("forward_pct80 %");
  });

  it("a retired version says so and has no explanation yet", async () => {
    serve();
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
    await open(/C1/);
    fireEvent.click(screen.getByRole("tab", { name: "v1 retired" }));

    const detail = screen.getByRole("region", { name: "C1 v1" });
    expect(detail).toHaveTextContent("Kept for audit of cases flagged while it was active");
    expect(detail).toHaveTextContent("No explanation yet");
    expect(detail).toHaveTextContent("relative · −24 h → 0 h");
  });

  it("shows an error with retry when the rules fail to load", async () => {
    const fetch = serve(() => json({}, 500));
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(within(await list()).getAllByRole("button")).not.toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows why a version was proposed, and says so when an old one has no reason", async () => {
    serve(() =>
      json([...SEEDED, { ...B2_V2, changeReason: "PEP outflows under 100k went unflagged" }]),
    );
    const { unmount } = render(
      <RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />,
      { route: `/rules?rule=${B2_V2.id}` },
    );
    expect(await screen.findByRole("region", { name: "Why this change" })).toHaveTextContent(
      "PEP outflows under 100k went unflagged",
    );
    unmount();

    serve(() => json([...SEEDED, B2_V2]));
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    expect(await screen.findByRole("region", { name: "Why this change" })).toHaveTextContent(
      "Not recorded: saved before a reason was required",
    );
  });

  it("sends a draft for approval and shows whom it waits for", async () => {
    const pending = { ...B2_V2, status: "pending" as const, assignee: "M. Svobodová" };
    const fetch = serve(
      () => json([...SEEDED, B2_V2]),
      () => json(pending),
    );
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={ANALYST} users={USERS} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Send to M. Svobodová" }));

    const detail = await screen.findByText(/Waiting for approval by M. Svobodová/);
    expect(detail).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `/api/rules/${B2_V2.id}/submit`,
      expect.objectContaining({ body: JSON.stringify({ approverId: 2 }) }),
    );
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });

  it("deletes a draft after a confirm and offers no new version from it", async () => {
    const fetch = serve(
      () => json([...SEEDED, B2_V2]),
      () => new Response(null, { status: 204 }),
      () => json(SEEDED),
    );
    render(<RulesPage author="J. Novák" user={null} users={[]} onBacktest={() => {}} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    await screen.findByRole("button", { name: "Delete" });
    expect(screen.queryByRole("button", { name: /New version from/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Delete draft B2 v2" })).getByRole("button", {
        name: "Delete draft",
      }),
    );

    expect(await screen.findByRole("button", { name: /New version from v1/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `/api/rules/${B2_V2.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("lets a compliance officer approve a pending version", async () => {
    const pending = { ...B2_V2, status: "pending" as const, assignee: "M. Svobodová" };
    const fetch = serve(
      () => json([...SEEDED, pending]),
      () => json({ ...pending, status: "active", assignee: null, approver: "M. Svobodová" }),
    );
    render(<RulesPage author="M. Svobodová" user={OFFICER} users={USERS} onBacktest={() => {}} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Approve v2" }));

    expect(await screen.findByRole("tab", { name: "v2 active" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(`/api/rules/${B2_V2.id}/approve`, expect.anything());
  });

  it("lets a compliance officer send their own draft only to someone of their level or higher", async () => {
    const own = { ...B2_V2, author: "M. Svobodová" };
    serve(() => json([...SEEDED, own]));
    render(<RulesPage author="M. Svobodová" user={OFFICER} users={USERS} onBacktest={() => {}} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    expect(await screen.findByRole("button", { name: "Send to P. Dvořák" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose approver" }));
    const menu = screen.getByRole("menu", { name: "Approvers" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((o) => o.textContent),
    ).toEqual(["P. Dvořák· Compliance manager"]);
  });

  it("never offers the sender as approver, even of someone else's draft", async () => {
    serve(() => json([...SEEDED, B2_V2]));
    render(<RulesPage author="M. Svobodová" user={OFFICER} users={USERS} onBacktest={() => {}} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    expect(await screen.findByRole("button", { name: "Send to P. Dvořák" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose approver" }));
    expect(
      within(screen.getByRole("menu", { name: "Approvers" }))
        .getAllByRole("menuitem")
        .map((o) => o.textContent),
    ).toEqual(["P. Dvořák· Compliance manager"]);
  });

  it("sends a draft to the approver picked from the arrow", async () => {
    const pending = { ...B2_V2, status: "pending" as const, assignee: "P. Dvořák" };
    const fetch = serve(
      () => json([...SEEDED, B2_V2]),
      () => json(pending),
    );
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={ANALYST} users={USERS} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Choose approver" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /P\. Dvořák/ }));

    expect(await screen.findByText(/Waiting for approval by P. Dvořák/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `/api/rules/${B2_V2.id}/submit`,
      expect.objectContaining({ body: JSON.stringify({ approverId: 3 }) }),
    );
  });

  it("lets a compliance manager decide only a version sent to them", async () => {
    const toOfficer = { ...B2_V2, status: "pending" as const, assignee: "M. Svobodová" };
    serve(() => json([...SEEDED, toOfficer]));
    const { unmount } = render(
      <RulesPage author="P. Dvořák" user={BOARD} users={USERS} onBacktest={() => {}} />,
      { route: `/rules?rule=${B2_V2.id}` },
    );
    expect(await screen.findByText(/Waiting for approval by M. Svobodová/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve v2" })).not.toBeInTheDocument();
    unmount();

    serve(() => json([...SEEDED, { ...toOfficer, assignee: "P. Dvořák" }]));
    render(<RulesPage author="P. Dvořák" user={BOARD} users={USERS} onBacktest={() => {}} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    expect(await screen.findByRole("button", { name: "Approve v2" })).toBeInTheDocument();
  });

  it("never offers a compliance officer the approval of a version they wrote", async () => {
    const pending = {
      ...B2_V2,
      status: "pending" as const,
      author: "M. Svobodová",
      assignee: "P. Dvořák",
    };
    serve(() => json([...SEEDED, pending]));
    render(<RulesPage author="M. Svobodová" user={OFFICER} users={USERS} onBacktest={() => {}} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    expect(
      await screen.findByText(/You wrote this version; P. Dvořák decides it/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve v2" })).not.toBeInTheDocument();
  });

  it("shows the engine's reason when an approval is refused", async () => {
    const pending = { ...B2_V2, status: "pending" as const, assignee: "M. Svobodová" };
    serve(
      () => json([...SEEDED, pending]),
      () => json({ detail: "only a compliance officer can approve a rule" }, 403),
    );
    render(<RulesPage author="M. Svobodová" user={OFFICER} users={USERS} onBacktest={() => {}} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Approve v2" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "only a compliance officer can approve a rule",
    );
  });

  it("exports the rules in force at the picked date, without drafts", async () => {
    serve(() => json([...SEEDED, B2_V2]));
    render(<RulesPage author="J. Novák" user={null} users={[]} onBacktest={() => {}} />);
    await list();
    fireEvent.click(screen.getByRole("button", { name: "Export rules" }));
    fireEvent.change(screen.getByLabelText("Rules valid at"), {
      target: { value: "2026-10-20T08:00" },
    });
    const report = screen.getByRole("article", { name: "Rules export" });
    expect(within(report).getByText("2026-10-20 08:00")).toBeInTheDocument();
    expect(within(report).getByRole("region", { name: "B2 v1" })).toBeInTheDocument();
    expect(within(report).queryByRole("region", { name: "B2 v2" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rules valid at"), {
      target: { value: "2026-01-01T00:00" },
    });
    expect(within(report).getByText("No rule was in force at this date.")).toBeInTheDocument();
  });
});
