import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { TriageScoringPage } from "../TriageScoringPage";
import { CONFIG, COVERAGE, json, problem, rescored, RULES } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

/** Serves the three loads; `onPatch` answers each rescore, by the rule key in its URL. */
const serve = (
  onPatch: (url: string) => Response | Promise<Response> = () => json(rescored("A1", 30)),
) => {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return onPatch(url);
    if (url.startsWith("/api/triage/coverage")) return json(COVERAGE);
    if (url.startsWith("/api/triage/config")) return json(CONFIG);
    if (url.startsWith("/api/rules")) return json(RULES);
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

const slider = (key: string) => screen.getByRole("slider", { name: `Score for ${key}` });
const findSlider = (key: string) => screen.findByRole("slider", { name: `Score for ${key}` });

const rowOf = (key: string) => screen.getByRole("row", { name: new RegExp(`^${key} `) });

const revertOf = (key: string) =>
  screen.getByRole("button", { name: new RegExp(`^Revert ${key}`) });

const saveButton = () => screen.getByRole("button", { name: /^Sav/ });

const patches = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");

const bodiesOf = (fetch: ReturnType<typeof serve>) =>
  patches(fetch).map(([url, init]) => [url, JSON.parse(String(init?.body))]);

/** Loads the page and waits for the table. */
const open = async () => {
  render(<TriageScoringPage author="J. Novák" />);
  await findSlider("A1");
};

describe("TriageScoringPage", () => {
  it("groups the scored rules by alert type, in key order", async () => {
    serve();
    await open();

    const headers = screen.getAllByText(/^Alert type /).map((h) => h.textContent);
    expect(headers).toEqual(["Alert type A", "Alert type B", "Alert type C"]);

    const rows = screen.getAllByRole("slider").map((s) => s.getAttribute("aria-label"));
    expect(rows).toEqual(["Score for A1", "Score for A3", "Score for B2", "Score for C1"]);
  });

  it("shows a scored rule's number and the band it lands in", async () => {
    serve();
    await open();
    expect(slider("B2")).toHaveValue("35");
    expect(rowOf("B2")).toHaveTextContent("Low review");
    expect(rowOf("A1")).toHaveTextContent("Auto-close");
  });

  it("names the unscored rules and the fallback the engine uses meanwhile", async () => {
    serve();
    await open();
    expect(screen.getByText("A3 and C1 have no score.")).toBeInTheDocument();
    expect(
      screen.getByText(/Until it’s set, the engine uses 70 and sends every alert to High review\./),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Not set · uses 70")).toHaveLength(2);
  });

  it("moves a slider without sending anything to the engine", async () => {
    const fetch = serve();
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });

    expect(patches(fetch)).toHaveLength(0);
    expect(slider("A1")).toHaveValue("30");
    expect(revertOf("A1")).toBeInTheDocument();
    // The score and the band follow the draft, so the row reads as it will once saved.
    expect(rowOf("A1")).toHaveTextContent("Low review");
  });

  it("offers Save only once a score has changed", async () => {
    serve();
    await open();
    expect(screen.getByText("All scores saved")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    fireEvent.change(slider("A1"), { target: { value: "30" } });
    expect(screen.getByText(/^1 unsaved change · /)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(saveButton()).toHaveTextContent("Save 1 change");

    fireEvent.change(slider("B2"), { target: { value: "50" } });
    expect(screen.getByText("2 unsaved changes · A1, B2")).toBeInTheDocument();
    expect(saveButton()).toHaveTextContent("Save 2 changes");
  });

  it("marks a changed row with what the score was and a way back", async () => {
    serve();
    await open();
    expect(screen.queryByRole("button", { name: /^Revert/ })).not.toBeInTheDocument();

    fireEvent.change(slider("B2"), { target: { value: "50" } });
    expect(rowOf("B2")).toHaveTextContent("was 35");
    expect(screen.getByRole("button", { name: "Revert B2 to 35" })).toBeInTheDocument();
    // Only the changed row gets one.
    expect(screen.getAllByRole("button", { name: /^Revert/ })).toHaveLength(1);
  });

  it("reserves what a changed row needs on every row, so an edit cannot move the rows below", async () => {
    serve();
    await open();
    // happy-dom does no layout (offsetHeight is always 0), so this checks the two things the design relies on to
    // hold the height: every row is 52px tall whether or not it is dirty, and the dirty marking is an inset
    // shadow, which takes no layout space — unlike the border it replaced.
    expect(rowOf("A1").className).toContain("h-[52px]");
    expect(rowOf("A1").querySelector('[data-slot="was"]')).toBeNull();

    fireEvent.change(slider("A1"), { target: { value: "30" } });

    expect(rowOf("A1").className).toContain("h-[52px]");
    expect(rowOf("A1").className).toContain("shadow-[inset_3px_0_0_var(--color-yellow)]");
    expect(rowOf("A1").querySelector('[data-slot="was"]')).toHaveTextContent("was 8");
    // The rows below keep their height, so nothing under the edited row moves.
    expect(rowOf("B2").className).toContain("h-[52px]");
  });

  it("says an unscored rule had no score before, and offers the same way back", async () => {
    serve();
    await open();
    fireEvent.change(slider("A3"), { target: { value: "20" } });
    expect(rowOf("A3")).toHaveTextContent("was not set");
    expect(screen.getByRole("button", { name: "Revert A3 to not set" })).toBeInTheDocument();
  });

  it("reverts one rule to its stored score without asking the engine", async () => {
    const fetch = serve();
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.change(slider("B2"), { target: { value: "50" } });
    expect(screen.getByText("2 unsaved changes · A1, B2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revert A1 to 8" }));

    expect(slider("A1")).toHaveValue("8");
    expect(screen.queryByRole("button", { name: /^Revert A1/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 unsaved change · B2")).toBeInTheDocument();
    // The other change is untouched, and nothing went to the engine.
    expect(slider("B2")).toHaveValue("50");
    expect(patches(fetch)).toHaveLength(0);
  });

  it("discards every change at once", async () => {
    const fetch = serve();
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.change(slider("B2"), { target: { value: "50" } });

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByText("All scores saved")).toBeInTheDocument();
    expect(slider("A1")).toHaveValue("8");
    expect(slider("B2")).toHaveValue("35");
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(patches(fetch)).toHaveLength(0);
  });

  it("disables Save again when a slider goes back to the score it started on", async () => {
    serve();
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    expect(saveButton()).toBeEnabled();

    fireEvent.change(slider("A1"), { target: { value: "8" } });
    expect(screen.getByText("All scores saved")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Revert A1/ })).not.toBeInTheDocument();
  });

  it("saves one PATCH per changed rule, in key order, carrying each rule's flags over", async () => {
    const fetch = serve((url) => json(rescored(url.endsWith("A1") ? "A1" : "B2", 30)));
    await open();
    fireEvent.change(slider("B2"), { target: { value: "50" } });
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(
        screen.getByText(/^Saved at \d\d:\d\d · applies from the next run$/),
      ).toBeInTheDocument(),
    );
    expect(bodiesOf(fetch)).toEqual([
      [
        "/api/triage/config/rules/A1",
        { author: "J. Novák", baseScore: 30, autoCloseable: true, impliesPep: false },
      ],
      [
        "/api/triage/config/rules/B2",
        { author: "J. Novák", baseScore: 50, autoCloseable: false, impliesPep: true },
      ],
    ]);
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Revert/ })).not.toBeInTheDocument();
  });

  it("keeps the rule dirty and says why when the engine refuses the score", async () => {
    const fetch = serve(() => problem("a base score must be between 0 and 100"));
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.click(saveButton());

    expect(
      await screen.findByText("Could not save: a base score must be between 0 and 100"),
    ).toBeInTheDocument();
    expect(patches(fetch)).toHaveLength(1);
    expect(screen.getByText(/^1 unsaved change · /)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(revertOf("A1")).toBeInTheDocument();
    expect(slider("A1")).toHaveValue("30");
  });

  it("stops at a refused patch, keeping the rules already written and the rest dirty", async () => {
    const fetch = serve((url) =>
      url.endsWith("A1") ? json(rescored("A1", 30)) : problem("rule B2 is scored twice"),
    );
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.change(slider("B2"), { target: { value: "50" } });
    fireEvent.click(saveButton());

    expect(await screen.findByText("Could not save: rule B2 is scored twice")).toBeInTheDocument();
    expect(patches(fetch)).toHaveLength(2);
    // A1 went through and is no longer dirty; B2 did not and still is.
    expect(screen.getByText(/^1 unsaved change · /)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Revert A1/ })).not.toBeInTheDocument();
    expect(revertOf("B2")).toBeInTheDocument();
  });

  it("makes the whole table read-only while a save is in flight", async () => {
    // The PATCH is held open, so the table can be inspected mid-save.
    let release: ((answer: Response) => void) | undefined;
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    serve(() => held);
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(slider("A1")).toBeDisabled());
    expect(slider("B2")).toBeDisabled();
    expect(slider("C1")).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Saving…");
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revert A1 to 8" })).toBeDisabled();

    await act(async () => {
      release?.(json(rescored("A1", 30)));
      await held;
    });
    await waitFor(() => expect(slider("B2")).toBeEnabled());
  });

  it("offers a retry when the config cannot be loaded", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith("/api/triage/config")
        ? problem("no triage config is active", 404)
        : json(url.startsWith("/api/rules") ? RULES : COVERAGE),
    );
    vi.stubGlobal("fetch", fetch);
    render(<TriageScoringPage author="J. Novák" />);

    expect(
      await screen.findByText(/Could not load the rule scores: no triage config is active/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(3));
  });
});
