import { fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { RulesPage } from "../RulesPage";
import { json, SEEDED } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

const serve = (...responses: (() => Response)[]) => {
  const fetch = vi.fn(async () => (responses.shift() ?? (() => json(SEEDED)))());
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

const list = () => screen.findByRole("navigation", { name: "Rules" });

describe("RulesPage", () => {
  it("lists keys with version badges", async () => {
    serve();
    render(<RulesPage author="J. Novák" onBack={() => {}} />);
    const c1 = within(await list()).getByRole("button", { name: /C1/ });
    expect(c1).toHaveTextContent("v2 active");
    expect(c1).toHaveTextContent("v1 retired");
  });

  it("selecting a key shows its newest version with explanation, condition and parameters", async () => {
    serve();
    render(<RulesPage author="J. Novák" onBack={() => {}} />);
    fireEvent.click(within(await list()).getByRole("button", { name: /B2/ }));

    const detail = screen.getByRole("region", { name: "B2 v1" });
    expect(detail).toHaveTextContent(
      "Flags outgoing or unknown-direction transactions of more than 100,000 CZK",
    );
    expect(detail).toHaveTextContent("client.pep && tx.amount > p.pep_min");
    expect(detail).toHaveTextContent("pep_min");
    expect(detail).toHaveTextContent("10,000,000 haléře (100,000 CZK)");
  });

  it('shows "No explanation yet" when the explanation is null', async () => {
    serve();
    render(<RulesPage author="J. Novák" onBack={() => {}} />);
    fireEvent.click(within(await list()).getByRole("button", { name: /C1/ }));
    fireEvent.click(screen.getByRole("button", { name: "v1 retired" }));

    const detail = screen.getByRole("region", { name: "C1 v1" });
    expect(detail).toHaveTextContent("No explanation yet");
    expect(detail).toHaveTextContent("payers");
    expect(detail).toHaveTextContent("24 hours before the anchor, up to it");
  });

  it("shows an error with retry when the rules fail to load", async () => {
    const fetch = serve(() => json({}, 500));
    render(<RulesPage author="J. Novák" onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(within(await list()).getAllByRole("button")).not.toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("goes back to the review queue", async () => {
    serve();
    const onBack = vi.fn();
    render(<RulesPage author="J. Novák" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "← Review queue" }));
    expect(onBack).toHaveBeenCalled();
  });
});
