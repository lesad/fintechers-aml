import { rulesSummary } from "./rules";

import type { AlertStatus, Disposition, FlaggedTransaction } from "./api";
import type { AiStatus, CaseStatus, RiskLevel } from "@/components";

export type QueueItem = {
  id: string;
  client: string;
  rule: RiskLevel;
  ruleReason: string;
  ai: AiStatus;
  /** CZK */
  amount: number;
  /** Transaction date and time as shown, `YYYY-MM-DD HH:mm`. */
  date: string;
  status: CaseStatus;
  flagged: Date;
  /** The engine's triage: what should happen to the case, and its 0–100 score. */
  disposition: Disposition;
  score: number;
};

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  AUTO_CLOSE: "Closed by triage",
  REVIEW_LOW: "Review · low",
  REVIEW_MEDIUM: "Review · medium",
  REVIEW_HIGH: "Review · high",
  ESCALATE: "Escalate",
};

/** `2026-07-01T00:15:25` → `2026-07-01 00:15` */
export const formatTs = (ts: string) => ts.slice(0, 16).replace("T", " ");

export function toQueueItem(f: FlaggedTransaction): QueueItem {
  return {
    id: f.id,
    client: f.clientId,
    rule: f.rating,
    ruleReason: rulesSummary(f.rules.map((r) => r.name)),
    ai: f.aiRating ? { rating: f.aiRating } : "none",
    amount: f.amount,
    date: formatTs(f.ts),
    status: CASE_STATUS[f.status],
    flagged: new Date(f.flaggedAt),
    disposition: f.disposition,
    score: f.score,
  };
}

export type StatusFilter = CaseStatus | "all";

export type QueueFilter = {
  /** Transaction or client id, matched by the engine. */
  query: string;
  rating: RiskLevel | "all";
  status: StatusFilter;
};

export const NO_FILTER: QueueFilter = { query: "", rating: "all", status: "all" };

/** The engine's alert status for each case status the UI shows (`GET /api/transactions?status=`). */
export const STATUS_CODE: Record<CaseStatus, AlertStatus> = {
  New: "NEW",
  Escalated: "ESCALATED",
  "False Positive": "FALSE_POSITIVE",
  Reported: "REPORTED",
};

export type Role = "Reviewer" | "Manager";

/** Every case status, in workflow order: the status filter offers these. */
export const CASE_STATUSES: CaseStatus[] = ["New", "Escalated", "False Positive", "Reported"];

/** The engine's `status` parameter: the chosen status, or none (every status) when none is chosen. */
export const statusParam = (status: StatusFilter) => (status === "all" ? "" : STATUS_CODE[status]);

/** The case status the UI shows for each engine status. */
export const CASE_STATUS: Record<AlertStatus, CaseStatus> = {
  NEW: "New",
  ESCALATED: "Escalated",
  FALSE_POSITIVE: "False Positive",
  REPORTED: "Reported",
};

/** "12 min", "5h 3m", "2d 4h". */
export function formatAge(flagged: Date, now: Date): string {
  const m = Math.round((now.getTime() - flagged.getTime()) / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const formatAmount = (czkAmount: number) =>
  czkAmount.toLocaleString("en-US", { minimumFractionDigits: 2 });
