import { CASE_STATUS, formatTs } from "./queue";
import { ruleThresholds } from "./rules";

import type { HistoryTransaction, TransactionDetail } from "./api";
import type { Decision } from "./decisions";
import type { FlowTx } from "./MoneyFlow";

const toFlow = (h: HistoryTransaction): FlowTx => ({
  id: h.id,
  dt: formatTs(h.ts),
  dir: h.direction === "in" ? "Incoming" : h.direction === "out" ? "Outgoing" : "Remittance",
  counterparty: h.counterpartyAccount ?? "—",
  country: h.counterpartyCountry ?? "—",
  amount: h.amount,
});

const alertIdsOf = (
  alerts: TransactionDetail["alerts"],
  first: TransactionDetail["alerts"][number] | undefined,
) => [...(first ? [first] : []), ...alerts.filter((a) => a !== first)].map((a) => a.id);

/**
 * What the detail shows about one transaction, derived from the engine's detail and the decision
 * made in the browser. Pure, so the case rules (who decides, what status) are testable on their own.
 */
export function caseState(detail: TransactionDetail, decision: Decision | undefined) {
  const { transaction: tx, rating, alerts } = detail;
  const hits = alerts.flatMap((a) => a.hits);
  const autoClosed = detail.disposition === "AUTO_CLOSE";
  const triageAlert = alerts.find((a) => a.triage?.disposition === detail.disposition);
  const day = tx.ts.slice(0, 10);
  const dayTx = detail.day.map(toFlow).toSorted((a, b) => (a.dt > b.dt ? 1 : -1));

  const saved =
    detail.status && detail.status !== "NEW"
      ? CASE_STATUS[detail.status]
      : autoClosed
        ? "False Positive"
        : "New";

  return {
    thresholds: ruleThresholds(hits),
    ruleNames: [
      ...new Map(
        hits.toSorted((a, b) => (a.rule > b.rule ? 1 : -1)).map((h) => [h.rule, h.name]),
      ).values(),
    ],
    alertTypes: alerts.map((a) => a.alertType),
    flaggedAt: alerts[0] ? new Date(alerts[0].createdAt) : null,
    /** The triage of the alert that set the transaction's (most severe) disposition. */
    triage: triageAlert?.triage ?? null,
    /** Every alert, the one behind the triage first: each gets its own AI Rating card. */
    alertIds: alertIdsOf(alerts, triageAlert),
    /** What the engine holds: its status once someone decided; a false positive when triage closed it; else New. */
    saved,
    /** Not flagged → no status; a decision made here wins over what the engine holds. */
    status: rating ? (decision?.action ?? saved) : null,
    /** Who decides: nobody (not flagged), triage already did, or the reviewer. */
    decides: !rating ? "nobody" : autoClosed ? "triage" : "reviewer",
    /** This transaction as a history row; the engine always lists it among its day's transactions. */
    current: detail.day.find((h) => h.id === tx.id),
    dayTx,
    dayLabel: `${new Date(`${day}T12:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })} · ${dayTx.length} ${dayTx.length === 1 ? "transaction" : "transactions"}`,
  } as const;
}
