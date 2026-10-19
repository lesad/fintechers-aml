import { czk, type HistoryTransaction, type TransactionDetail } from "./api";
import { formatTs } from "./queue";
import { strongestFacts } from "./rules";

import type { Decision } from "./decisions";
import type { FlowTx } from "./MoneyFlow";

const toFlow = (h: HistoryTransaction): FlowTx => ({
  id: h.id,
  dt: formatTs(h.ts),
  dir: h.direction === "in" ? "Incoming" : h.direction === "out" ? "Outgoing" : "Remittance",
  counterparty: h.counterpartyAccount ?? "—",
  country: h.counterpartyCountry ?? "—",
  amount: czk(h.amountHalere),
});

/**
 * What the detail shows about one transaction, derived from the engine's detail and the decision
 * made in the browser. Pure, so the case rules (who decides, what status) are testable on their own.
 */
export function caseState(detail: TransactionDetail, decision: Decision | undefined) {
  const { transaction: tx, client, rating, alerts } = detail;
  const hits = alerts.flatMap((a) => a.hits);
  const autoClosed = detail.disposition === "AUTO_CLOSE";
  const day = tx.ts.slice(0, 10);
  const dayTx = detail.history
    .filter((h) => h.ts.startsWith(day))
    .map(toFlow)
    .toSorted((a, b) => (a.dt > b.dt ? 1 : -1));

  return {
    facts: strongestFacts(hits, client),
    ruleNames: [
      ...new Map(
        hits.toSorted((a, b) => (a.rule > b.rule ? 1 : -1)).map((h) => [h.rule, h.name]),
      ).values(),
    ],
    alertTypes: alerts.map((a) => a.alertType),
    flaggedAt: alerts[0] ? new Date(alerts[0].createdAt) : null,
    /** The triage of the alert that set the transaction's (most severe) disposition. */
    triage: alerts.find((a) => a.triage?.disposition === detail.disposition)?.triage ?? null,
    /** Not flagged → no status; a false positive when triage closed it, unless someone decided otherwise; else New. */
    status: rating ? (decision?.action ?? (autoClosed ? "False Positive" : "New")) : null,
    /** Who decides: nobody (not flagged), triage already did, or the reviewer. */
    decides: !rating ? "nobody" : autoClosed ? "triage" : "reviewer",
    dayTx,
    dayLabel: `${new Date(`${day}T12:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })} · ${dayTx.length} ${dayTx.length === 1 ? "transaction" : "transactions"}`,
  } as const;
}
