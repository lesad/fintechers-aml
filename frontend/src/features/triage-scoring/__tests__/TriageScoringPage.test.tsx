import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/render";

import { TriageScoringPage } from "../TriageScoringPage";
import {
  ANALYST,
  as,
  CONFIG,
  COVERAGE,
  json,
  MANAGER,
  OFFICER,
  problem,
  proposed,
  RULES,
  USERS,
} from "./fixtures";

import type { TriageConfigVersion } from "../api";
import type { User } from "@/user";

afterEach(() => vi.unstubAllGlobals());

type ServeOptions = {
  /** What `GET /api/triage/configs` answers with, newest first. */
  versions?: TriageConfigVersion[];
  /** What it answers with once a change has gone through — the reload every mutation ends with. */
  after?: TriageConfigVersion[];
  /** Answers every POST, by the URL it was sent to. */
  onPost?: (url: string) => Response | Promise<Response>;
  /** Answers `DELETE /api/triage/config/{version}`. */
  onDelete?: () => Response | Promise<Response>;
};

const serve = ({
  versions = [CONFIG],
  after,
  onPost = () => json(proposed({ A1: 30 })),
  onDelete = () => new Response(null, { status: 204 }),
}: ServeOptions = {}) => {
  let stored = versions;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" || init?.method === "DELETE") {
      const res = init.method === "POST" ? await onPost(url) : await onDelete();
      // A refused change stores nothing, so only a successful one moves what the reload reads back.
      if (res.ok && after) stored = after;
      return res;
    }
    if (url.startsWith("/api/triage/configs")) return json(stored);
    if (url.startsWith("/api/triage/coverage")) return json(COVERAGE);
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

const posts = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === "POST");

const bodiesOf = (fetch: ReturnType<typeof serve>) =>
  posts(fetch).map(([url, init]) => [url, JSON.parse(String(init?.body))]);

/** Loads the page as [user] and waits for the table. */
const open = async (user: User = ANALYST) => {
  render(<TriageScoringPage author={user.name} user={user} users={USERS} />);
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

    expect(posts(fetch)).toHaveLength(0);
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
    expect(posts(fetch)).toHaveLength(0);
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
    expect(posts(fetch)).toHaveLength(0);
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

  it("saves every changed score as one draft version, in key order, carrying each rule's flags over", async () => {
    const draft = proposed({ A1: 30, B2: 50 });
    const fetch = serve({ after: [draft, CONFIG], onPost: () => json(draft) });
    await open();
    fireEvent.change(slider("B2"), { target: { value: "50" } });
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.click(saveButton());

    expect(await screen.findByText(/Draft v2 — not deciding alerts yet/)).toBeInTheDocument();
    expect(bodiesOf(fetch)).toEqual([
      [
        "/api/triage/config/draft",
        {
          author: "J. Novák",
          rules: [
            { ruleKey: "A1", baseScore: 30, autoCloseable: true, impliesPep: false },
            { ruleKey: "B2", baseScore: 50, autoCloseable: false, impliesPep: true },
          ],
        },
      ],
    ]);
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Revert/ })).not.toBeInTheDocument();
    // Nothing is live yet: the footer says what is still missing.
    expect(screen.getByText(/send it for approval to apply it/)).toBeInTheDocument();
  });

  it("keeps the rule dirty and says why when the engine refuses the proposal", async () => {
    const fetch = serve({ onPost: () => problem("a base score must be between 0 and 100") });
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.click(saveButton());

    expect(
      await screen.findByText("Could not save: a base score must be between 0 and 100"),
    ).toBeInTheDocument();
    expect(posts(fetch)).toHaveLength(1);
    expect(screen.getByText(/^1 unsaved change · /)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(revertOf("A1")).toBeInTheDocument();
    expect(slider("A1")).toHaveValue("30");
  });

  it("makes the whole table read-only while a save is in flight", async () => {
    // The POST is held open, so the table can be inspected mid-save.
    let release: ((answer: Response) => void) | undefined;
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    serve({ onPost: () => held });
    await open();
    fireEvent.change(slider("A1"), { target: { value: "30" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(slider("A1")).toBeDisabled());
    expect(slider("B2")).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent("Saving…");
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revert A1 to 8" })).toBeDisabled();

    await act(async () => {
      release?.(json(proposed({ A1: 30 })));
      await held;
    });
    await waitFor(() => expect(slider("B2")).toBeEnabled());
  });

  it("offers a retry when the config cannot be loaded", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith("/api/triage/configs")) return problem("the engine is down", 500);
      return json(url.startsWith("/api/rules") ? RULES : COVERAGE);
    });
    vi.stubGlobal("fetch", fetch);
    render(<TriageScoringPage author={ANALYST.name} user={ANALYST} users={USERS} />);

    expect(
      await screen.findByText(/Could not load the rule scores: the engine is down/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(3));
  });

  it("says so when no version is active, rather than showing an empty table", async () => {
    serve({ versions: [as(CONFIG, { status: "retired" })] });
    render(<TriageScoringPage author={ANALYST.name} user={ANALYST} users={USERS} />);

    expect(
      await screen.findByText(/Could not load the rule scores: no triage config is active/),
    ).toBeInTheDocument();
  });
});

describe("the open proposal", () => {
  const draft = proposed({ A1: 30 });
  const pending = proposed({ A1: 30 }, { status: "pending", assignee: OFFICER.name });
  const activated = proposed({ A1: 30 }, { status: "active", approver: OFFICER.name });

  it("shows what the draft would change and the sliders sitting on it", async () => {
    serve({ versions: [draft, CONFIG] });
    await open();

    expect(screen.getByText("Draft v2 — not deciding alerts yet")).toBeInTheDocument();
    expect(screen.getByText(/^Drafted by J. Novák, 2026-10-20 \d\d:00$/)).toBeInTheDocument();
    expect(screen.getByText("One score changes against v1:")).toBeInTheDocument();
    // The table shows the draft, so an edit stacks onto it rather than onto the active config.
    expect(slider("A1")).toHaveValue("30");
    expect(screen.getByText("Saved to draft v2 · send it for approval to apply it")).toBeTruthy();
  });

  it("sends the draft to an approver who neither wrote nor sends it", async () => {
    const fetch = serve({
      versions: [draft, CONFIG],
      after: [pending, CONFIG],
      onPost: () => json(pending),
    });
    await open();

    // The author is an analyst, so both approvers are eligible and the compliance officer is the default.
    fireEvent.click(screen.getByRole("button", { name: "Choose approver" }));
    expect(screen.getAllByRole("menuitem").map((b) => b.textContent)).toEqual([
      "M. Svobodová· Compliance officer",
      "P. Dvořák· Compliance manager",
    ]);
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Send to M. Svobodová" }));

    expect(
      await screen.findByText("v2 waiting for approval by M. Svobodová — not deciding alerts yet"),
    ).toBeInTheDocument();
    expect(bodiesOf(fetch)).toEqual([["/api/triage/config/2/submit", { approverId: OFFICER.id }]]);
  });

  it("leaves a pending version read-only for its author", async () => {
    serve({ versions: [pending, CONFIG] });
    await open();

    expect(slider("A1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Sav/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument();
  });

  it("offers Approve and Reject to the approver it was sent to", async () => {
    const fetch = serve({
      versions: [pending, CONFIG],
      after: [activated, as(CONFIG, { status: "retired" })],
      onPost: () => json(activated),
    });
    await open(OFFICER);

    fireEvent.click(screen.getByRole("button", { name: "Approve v2" }));

    await waitFor(() => expect(screen.queryByText(/not deciding alerts yet/)).toBeNull());
    expect(bodiesOf(fetch)).toEqual([["/api/triage/config/2/approve", {}]]);
    // What the table shows is the newly active config.
    expect(slider("A1")).toHaveValue("30");
  });

  it("sends a pending version back to draft when it is rejected", async () => {
    const fetch = serve({
      versions: [pending, CONFIG],
      after: [draft, CONFIG],
      onPost: () => json(draft),
    });
    await open(OFFICER);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Draft v2 — not deciding alerts yet")).toBeInTheDocument();
    expect(bodiesOf(fetch)).toEqual([["/api/triage/config/2/reject", {}]]);
    // It is editable again.
    expect(slider("A1")).toBeEnabled();
  });

  it("hides the decision from a compliance manager it was not sent to", async () => {
    serve({ versions: [pending, CONFIG] });
    await open(MANAGER);
    expect(screen.queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("throws the draft away with everything it proposed", async () => {
    const fetch = serve({ versions: [draft, CONFIG], after: [CONFIG] });
    await open();

    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));

    await waitFor(() => expect(screen.queryByText(/not deciding alerts yet/)).toBeNull());
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toEqual([
      ["/api/triage/config/2", expect.objectContaining({ method: "DELETE" })],
    ]);
    // The table is back on the active config.
    expect(slider("A1")).toHaveValue("8");
  });

  it("says why when the engine refuses a decision", async () => {
    serve({
      versions: [pending, CONFIG],
      onPost: () => problem("M. Svobodová wrote this version", 403),
    });
    await open(OFFICER);

    fireEvent.click(screen.getByRole("button", { name: "Approve v2" }));

    expect(
      await screen.findByText("Could not save: M. Svobodová wrote this version"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve v2" })).toBeInTheDocument();
  });
});

describe("the version strip in the header", () => {
  const pending = proposed({ A1: 30 }, { status: "pending", assignee: OFFICER.name });

  it("shows the version being decided beside the live one, newest first", async () => {
    serve({ versions: [pending, CONFIG] });
    await open();

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "v2in review",
      "v1active",
    ]);
    expect(screen.getByRole("tab", { name: /^v2/ })).toHaveAttribute("aria-selected", "true");
  });

  it("names who submitted the version it is on and who is reviewing it", async () => {
    serve({ versions: [pending, CONFIG] });
    await open();
    expect(
      screen.getByText(/^Submitted by J. Novák, 2026-10-20 \d\d:00 · reviewer M. Svobodová$/),
    ).toBeInTheDocument();
  });

  it("switches what the table shows, and says what the version it moved to is", async () => {
    serve({ versions: [pending, CONFIG] });
    await open();
    expect(slider("A1")).toHaveValue("30");

    fireEvent.click(screen.getByRole("tab", { name: /^v1/ }));

    expect(slider("A1")).toHaveValue("8");
    expect(screen.getByText(/^Active since 2026-10-20 \d\d:00 · by finreg-brief$/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^v1/ })).toHaveAttribute("aria-selected", "true");
  });

  it("carries a version opened from the history, so the strip always says where the reader is", async () => {
    const activated = proposed({ A1: 30 }, { status: "active" });
    serve({ versions: [activated, as(CONFIG, { status: "retired" })] });
    await open();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["v2active"]);

    fireEvent.click(screen.getByRole("button", { name: /^v1/ }));

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["v2active", "v1retired"]);
  });
});

describe("the version history", () => {
  const draft = proposed({ A1: 30 });
  const retiredV1 = as(CONFIG, { status: "retired" });

  it("lists every stored version, newest first, with what it changed", async () => {
    serve({ versions: [draft, CONFIG] });
    await open();

    const rows = screen.getAllByRole("button", { name: /^v\d/ }).map((b) => b.textContent);
    expect(rows).toEqual([
      "v2DraftA1 8 → 30J. Novák2026-10-20 09:00",
      "v1ActiveFirst version · 2 rules scoredfinreg-brief2026-10-20 09:00",
    ]);
  });

  it("marks the version the table is showing", async () => {
    serve({ versions: [draft, CONFIG] });
    await open();
    expect(screen.getByRole("button", { name: /^v2/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /^v1/ })).toHaveAttribute("aria-current", "false");
  });

  it("opens an earlier version read-only, and gets back to the one an edit lands in", async () => {
    serve({ versions: [draft, CONFIG] });
    await open();

    fireEvent.click(screen.getByRole("button", { name: /^v1/ }));

    // The table shows what v1 scored, and nothing on the page can change it.
    expect(slider("A1")).toHaveValue("8");
    expect(slider("A1")).toBeDisabled();
    expect(screen.getByText(/Viewing v1 \(active\), as it was on 2026-10-20 09:00\./)).toBeTruthy();
    expect(screen.getByText(/Read-only — scores are changed on v2\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Sav/ })).not.toBeInTheDocument();
    // The draft's panel steps aside while an earlier version is open.
    expect(screen.queryByText(/not deciding alerts yet/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to v2" }));

    expect(slider("A1")).toHaveValue("30");
    expect(slider("A1")).toBeEnabled();
    expect(screen.getByText("Draft v2 — not deciding alerts yet")).toBeInTheDocument();
  });

  it("shows the last ten and reveals the rest a page at a time", async () => {
    // Twelve versions: v12 active, the rest retired below it.
    const many = Array.from({ length: 12 }, (_, i) =>
      as(CONFIG, {
        version: 12 - i,
        status: i === 0 ? "active" : "retired",
        rules: [{ ruleKey: "A1", baseScore: 12 - i, autoCloseable: true, impliesPep: false }],
      }),
    );
    serve({ versions: many });
    await open();

    const shownVersions = () =>
      screen
        .getAllByRole("button", { name: /^v\d/ })
        .map((b) => /^v\d+/.exec(b.textContent ?? "")?.[0]);
    expect(shownVersions()).toHaveLength(10);
    expect(shownVersions()[0]).toBe("v12");
    expect(shownVersions().at(-1)).toBe("v3");
    expect(screen.getByText("10 of 12 versions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));

    expect(shownVersions()).toHaveLength(12);
    expect(shownVersions().at(-1)).toBe("v1");
    expect(screen.queryByRole("button", { name: /^Show \d+ more/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/of 12 versions/)).not.toBeInTheDocument();
  });

  it("offers no Show more when everything already fits", async () => {
    serve({ versions: [CONFIG] });
    await open();
    expect(screen.queryByRole("button", { name: /^Show \d+ more/ })).not.toBeInTheDocument();
  });

  it("reads a retired version against the one before it", async () => {
    const activated = proposed({ A1: 30 }, { status: "active" });
    serve({ versions: [activated, retiredV1] });
    await open();

    fireEvent.click(screen.getByRole("button", { name: /^v1/ }));

    expect(screen.getByText(/Viewing v1 \(retired\)/)).toBeInTheDocument();
    expect(slider("A1")).toHaveValue("8");
  });
});
