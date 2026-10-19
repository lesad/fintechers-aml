import { fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { RuleForm } from "../RuleForm";
import { RulesPage } from "../RulesPage";
import { B2, B2_V2, json, SEEDED } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

const form = (from = B2) =>
  render(<RuleForm from={from} author="J. Novák" onSaved={() => {}} onCancel={() => {}} />);

describe("RuleForm", () => {
  it("pre-fills from a version and locks alert type, layer and replaces", () => {
    form();
    expect(screen.getByLabelText("Condition")).toHaveValue(B2.condition);
    expect(screen.getByLabelText("Value of parameter 1")).toHaveValue("10000000");
    for (const field of ["Key", "Alert type", "Layer", "Replaces"]) {
      expect(screen.getByLabelText(field)).toHaveAttribute("readonly");
    }
  });

  it("a new rule starts empty with key, alert type, layer and replaces editable", () => {
    render(<RuleForm from={null} author="J. Novák" onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText("Key")).toHaveValue("");
    expect(screen.getByLabelText("Key")).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Alert type")).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Replaces")).not.toHaveAttribute("readonly");
    expect(
      within(screen.getByLabelText("Layer"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["company", "client"]);
  });

  it("shows the CZK reading next to a parameter value", () => {
    form();
    fireEvent.change(screen.getByLabelText("Value of parameter 1"), {
      target: { value: "5000000" },
    });
    expect(screen.getByText("= 50,000 CZK if an amount")).toBeInTheDocument();
  });

  it("anchor appears only for the client anchor grain", () => {
    render(<RuleForm from={null} author="J. Novák" onSaved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByLabelText("Anchor")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Evaluated per"), {
      target: { value: "client_anchor" },
    });
    expect(screen.getByLabelText("Anchor")).toBeInTheDocument();
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
    render(<RulesPage author="J. Novák" onBack={() => {}} />);
    fireEvent.click(
      within(await screen.findByRole("navigation", { name: "Rules" })).getByRole("button", {
        name: /B2/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "New version from this" }));
    fireEvent.change(screen.getByLabelText("Value of parameter 1"), {
      target: { value: "5000000" },
    });
  };

  it('saving shows "Writing explanation…" then selects the new draft', async () => {
    let respond: (() => void) | undefined;
    stub(() => new Promise((resolve) => (respond = () => resolve(json(B2_V2, 201)))));
    await openB2Form();
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(await screen.findByRole("button", { name: "Writing explanation…" })).toBeDisabled();
    respond?.();

    const detail = await screen.findByRole("region", { name: "B2 v2" });
    expect(detail).toHaveTextContent("more than 50,000 CZK");
    expect(
      within(screen.getByRole("navigation", { name: "Rules" })).getByRole("button", { name: /B2/ }),
    ).toHaveTextContent("v2 draft");
  });

  it("a rejected save shows the engine's message under the condition and keeps the form", async () => {
    const detail = "rule B2, condition: undeclared reference to 'tx.direcion'";
    stub(() => json({ status: 400, detail }, 400));
    await openB2Form();
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(detail);
    expect(screen.getByLabelText("Value of parameter 1")).toHaveValue("5000000");
  });

  it("the author sent is the current user", async () => {
    const calls = stub(() => json(B2_V2, 201));
    await openB2Form();
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await screen.findByRole("region", { name: "B2 v2" });
    expect(calls[0]?.body).toMatchObject({
      key: "B2",
      author: "J. Novák",
      params: { pep_min: 5_000_000 },
    });
  });
});
