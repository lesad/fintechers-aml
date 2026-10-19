import { describe, expect, it } from "vitest";

import { caseState } from "./case-state";

import type { TransactionDetail } from "./api";
import type { Decision } from "./decisions";

const base: TransactionDetail = {
  transaction: {
    id: "T1",
    clientId: "K1",
    ts: "2026-07-17T15:58:00",
    amount: 1,
    volume: 1,
    currency: "CZK",
    fxRate: 1,
    direction: "out",
    type: "outgoing payment",
    payerAccount: "K1",
    payerCountry: "CZ",
    payeeAccount: "A1",
    payeeCountry: "AT",
  },
  client: {
    id: "K1",
    country: "CZ",
    contractDate: null,
    channel: null,
    pep: false,
    type: null,
    risk: "low",
    expectedMonthly: 0,
    expectedCount: 0,
    q2Volume: 0,
    q2TxCount: 0,
    q2MaxTx: 0,
    q2Days: 91,
  },
  rating: "Low",
  disposition: "AUTO_CLOSE",
  status: "NEW",
  assignee: null,
  log: [],
  alerts: [],
  day: [
    {
      id: "T1",
      ts: "2026-07-17T15:58:00",
      direction: "out",
      counterpartyAccount: "A1",
      counterpartyCountry: "AT",
      amount: 1,
      alertTypes: ["A"],
    },
  ],
  historyCount: 2,
};

const closed: Decision = {
  action: "Escalated",
  reason: "r",
  at: "",
  by: "",
};

describe("caseState", () => {
  it("leaves a case triage closed to triage, until a reviewer decides otherwise", () => {
    expect(caseState(base, undefined)).toMatchObject({
      status: "False Positive",
      decides: "triage",
    });
    expect(caseState(base, closed)).toMatchObject({ status: "Escalated", decides: "triage" });
  });

  it("shows the status the engine holds once someone decided", () => {
    const escalated = {
      ...base,
      disposition: "REVIEW_HIGH" as const,
      rating: "High" as const,
      status: "ESCALATED" as const,
    };
    expect(caseState(escalated, undefined)).toMatchObject({
      saved: "Escalated",
      status: "Escalated",
    });
  });

  it("gives a flagged case to the reviewer, new until decided", () => {
    expect(
      caseState({ ...base, disposition: "REVIEW_HIGH", rating: "High" }, undefined),
    ).toMatchObject({
      status: "New",
      decides: "reviewer",
    });
  });

  it("has no status and no decider when nothing was flagged", () => {
    expect(caseState({ ...base, disposition: null, rating: null }, undefined)).toMatchObject({
      status: null,
      decides: "nobody",
    });
  });

  it("keeps only the transaction's day for the money flow", () => {
    const state = caseState(base, undefined);
    expect(state.dayTx.map((t) => t.id)).toEqual(["T1"]);
    expect(state.dayLabel).toBe("17 Jul 2026 · 1 transaction");
  });
});
