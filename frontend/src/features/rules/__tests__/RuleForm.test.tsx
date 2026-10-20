import { fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { RuleForm } from "../RuleForm";
import { RulesPage } from "../RulesPage";
import { B2, B2_V2, json, SEEDED } from "./fixtures";

import type { RuleVersion } from "../api";

// NOTE: the form loads its vocabulary on mount; a test that serves nothing gets a 404 instead of the network.
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({}, 404)),
  ),
);
afterEach(() => vi.unstubAllGlobals());

const form = (from: RuleVersion | null = B2) =>
  render(
    <RuleForm
      from={from}
      author="J. Novák"
      nextVersion={from ? 2 : 1}
      existingKeys={["A1", "B2", "C1"]}
      onSaved={() => {}}
      onCancel={() => {}}
    />,
  );

const save = (version: number) => screen.getByRole("button", { name: `Save as draft v${version}` });
const explain = (why: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: /Why this change/ }), {
    target: { value: why },
  });

describe("RuleForm", () => {
  it("starts a new version from the one it is based on, amounts in CZK", () => {
    form();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("B2 · new version v2");
    expect(screen.getByText("B2 · based on v1 active")).toBeInTheDocument();
    expect(screen.getByLabelText("Condition")).toHaveValue(B2.condition);
    expect(screen.getByLabelText("Value of parameter 1")).toHaveValue("100000");
    expect(screen.getByLabelText("Unit of parameter 1")).toHaveValue("amount");
    expect(screen.getByRole("radio", { name: "B" })).toBeDisabled();
  });

  it("cannot save a version without changes", () => {
    form();
    expect(screen.getByText("No changes from v1 yet")).toBeInTheDocument();
    expect(save(2)).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Value of parameter 1"), { target: { value: "50000" } });
    expect(screen.getByText("1 section changed · ready to save")).toBeInTheDocument();
    expect(screen.getByText("changed from v1")).toBeInTheDocument();
    expect(save(2)).toBeDisabled();

    explain("PEP outflows between 50k and 100k went unflagged");
    expect(save(2)).toBeEnabled();
  });

  it("asks no reason for a first version, which changes nothing", () => {
    form(null);
    expect(screen.queryByRole("textbox", { name: /Why this change/ })).not.toBeInTheDocument();
  });

  it("a blank new rule shows no issues until the user types", () => {
    form(null);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("New rule");
    expect(screen.queryByText("Rule code is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Name is required.")).not.toBeInTheDocument();
    expect(screen.getByText("Fill in the required fields")).toBeInTheDocument();
    expect(save(1)).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. C2"), { target: { value: "C" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. C2"), { target: { value: "" } });
    expect(screen.getByText("Rule code is required.")).toBeInTheDocument();
    expect(screen.queryByText("Name is required.")).not.toBeInTheDocument();
    expect(screen.getByText("1 issue to fix")).toBeInTheDocument();
  });

  it("offers to add a parameter the condition uses", () => {
    form();
    fireEvent.change(screen.getByLabelText("Condition"), {
      target: { value: `${B2.condition} && tx.amount < p.cap` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add p.cap" }));
    expect(screen.getByLabelText("Name of parameter 2")).toHaveValue("cap");
    expect(screen.queryByText("p.cap needs a number.")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Value of parameter 2"), { target: { value: "lots" } });
    expect(screen.getByText("p.cap needs a number.")).toBeInTheDocument();
  });

  it("the anchor field appears only for the per anchor transaction evaluation", () => {
    form(null);
    expect(screen.queryByLabelText("Anchor")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Per anchor transaction" }));
    expect(screen.getByLabelText("Anchor")).toBeInTheDocument();
  });
});

describe("completion", () => {
  const vocabulary = {
    tx: { amount: "double", direction: "string" },
    client: { pep: "bool" },
    day: {},
    lists: {},
    values: { "tx.direction": ["in", "out"] },
  };
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), {
      target: { value, selectionStart: value.length },
    });

  it("offers the vocabulary's fields in the condition and inserts the one chosen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(vocabulary)),
    );
    form();
    type("Condition", "client.pep && tx.");
    const list = await screen.findByRole("listbox");
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["tx.amountdouble", "tx.directionstring"]);
    fireEvent.keyDown(screen.getByLabelText("Condition"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByLabelText("Condition"), { key: "Enter" });
    expect(screen.getByLabelText("Condition")).toHaveValue("client.pep && tx.direction");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("offers a text field's values in a variable filter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(vocabulary)),
    );
    form(null);
    fireEvent.click(screen.getByRole("button", { name: "+ Add variable" }));
    await screen.findByRole("button", { name: "Remove variable 1" });
    type("Filter of variable 1", 'tx.direction == "');
    fireEvent.mouseDown(await screen.findByRole("option", { name: /out/ }));
    expect(screen.getByLabelText("Filter of variable 1")).toHaveValue('tx.direction == "out"');
  });

  it("closes when the caret moves elsewhere, so Enter cannot insert at the old place", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(vocabulary)),
    );
    form();
    type("Condition", "tx.");
    await screen.findByRole("listbox");
    fireEvent.keyDown(screen.getByLabelText("Condition"), { key: "Home" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    type("Condition", "tx.d");
    await screen.findByRole("listbox");
    fireEvent.mouseDown(screen.getByLabelText("Condition"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("still offers the draft's parameters when the vocabulary does not load", async () => {
    const fetch = vi.fn(async () => json({}, 500));
    vi.stubGlobal("fetch", fetch);
    form();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    type("Condition", "p.");
    expect(await screen.findByRole("option", { name: /p\.pep_min/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Condition"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("What it flags", () => {
  it("writes the explanation on click and says when the rule changed since", async () => {
    const fetch = vi.fn(async () =>
      json({ explanation: "Flags PEP payments over 100,000 CZK.", model: "m" }),
    );
    vi.stubGlobal("fetch", fetch);
    form();
    fireEvent.click(screen.getByRole("button", { name: "Write explanation" }));
    expect(await screen.findByText("Flags PEP payments over 100,000 CZK.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/rules/explanation",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.change(screen.getByLabelText("Value of parameter 1"), { target: { value: "50000" } });
    expect(screen.getByText(/The rule changed since/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write again" })).toBeEnabled();
  });

  it("cannot be written while the rule is incomplete", () => {
    form(null);
    expect(screen.getByRole("button", { name: "Write explanation" })).toBeDisabled();
  });
});

describe("saving from the rules page", () => {
  const stub = (post: () => Response | Promise<Response>) => {
    const calls: { method: string; body: unknown }[] = [];
    let saved = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          calls.push({ method: "POST", body: JSON.parse(String(init.body)) });
          const res = await post();
          saved = res.status === 201;
          return res;
        }
        return json(saved ? [...SEEDED, B2_V2] : SEEDED);
      }),
    );
    return calls;
  };

  const openB2Form = async () => {
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
    fireEvent.click(
      within(await screen.findByRole("navigation", { name: "Rules" })).getByRole("button", {
        name: /B2/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "New version from v1" }));
    fireEvent.change(screen.getByLabelText("Value of parameter 1"), { target: { value: "50000" } });
    explain("PEP outflows between 50k and 100k went unflagged");
  };

  it('saving shows "Writing explanation…" then selects the new draft', async () => {
    let respond: (() => void) | undefined;
    stub(() => new Promise((resolve) => (respond = () => resolve(json(B2_V2, 201)))));
    await openB2Form();
    fireEvent.click(save(2));
    expect(await screen.findByRole("button", { name: "Writing explanation…" })).toBeDisabled();
    respond?.();

    const detail = await screen.findByRole("region", { name: "B2 v2" });
    expect(detail).toHaveTextContent("more than 50,000 CZK");
    expect(
      within(screen.getByRole("navigation", { name: "Rules" })).getByRole("button", { name: /B2/ }),
    ).toHaveTextContent("draft v2");
  });

  it("a rejected save shows the engine's message under the condition and keeps the form", async () => {
    const detail = "rule B2, condition: undeclared reference to 'tx.direcion'";
    stub(() => json({ status: 400, detail }, 400));
    await openB2Form();
    fireEvent.click(save(2));

    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
    expect(screen.getByLabelText("Value of parameter 1")).toHaveValue("50000");
  });

  it("sends the current user, the name and the amount in CZK", async () => {
    const calls = stub(() => json(B2_V2, 201));
    await openB2Form();
    fireEvent.click(save(2));
    await screen.findByRole("region", { name: "B2 v2" });
    expect(calls[0]?.body).toMatchObject({
      key: "B2",
      name: "PEP outgoing payment above the limit",
      author: "J. Novák",
      params: { pep_min: { value: 50_000, unit: "amount" } },
      changeReason: "PEP outflows between 50k and 100k went unflagged",
    });
  });
});

describe("editing a draft", () => {
  it("overwrites the draft in place and shows the saved version", async () => {
    const edited: RuleVersion = {
      ...B2_V2,
      params: { pep_min: { value: 70_000, unit: "amount" } },
    };
    const puts: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          puts.push({ url, body: JSON.parse(String(init.body)) });
          return json(edited);
        }
        return json([...SEEDED, puts.length ? edited : B2_V2]);
      }),
    );
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />, {
      route: `/rules?rule=${B2_V2.id}`,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("B2 · edit draft v2");
    fireEvent.change(screen.getByLabelText("Value of parameter 1"), { target: { value: "70000" } });
    expect(screen.getByRole("button", { name: "Save draft v2" })).toBeDisabled();
    explain("Raised after the backtest: 50k flagged too many salaries");
    fireEvent.click(screen.getByRole("button", { name: "Save draft v2" }));

    const detail = await screen.findByRole("region", { name: "B2 v2" });
    expect(detail).toHaveTextContent("70,000 CZK");
    expect(puts).toEqual([
      {
        url: `/api/rules/${B2_V2.id}`,
        body: expect.objectContaining({
          key: "B2",
          params: { pep_min: { value: 70_000, unit: "amount" } },
          changeReason: "Raised after the backtest: 50k flagged too many salaries",
        }),
      },
    ]);
  });

  it("offers editing only on a draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(SEEDED)),
    );
    render(<RulesPage author="J. Novák" onBacktest={() => {}} user={null} users={[]} />);
    await screen.findByRole("button", { name: /New version from/ });
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
