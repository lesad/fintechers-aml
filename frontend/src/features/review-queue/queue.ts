import type { AiRating, CaseStatus, RiskLevel } from "@/components";

export type QueueItem = {
  id: string;
  client: string;
  rule: RiskLevel;
  ruleReason: string;
  ai: AiRating;
  /** CZK */
  amount: number;
  /** Transaction date and time as shown, `YYYY-MM-DD HH:mm`. */
  date: string;
  status: CaseStatus;
  flagged: Date;
};

export type QueueFilter = {
  query: string;
  rating: RiskLevel | "all";
  status: CaseStatus | "all" | "open";
};

export const NO_FILTER: QueueFilter = { query: "", rating: "all", status: "all" };

const rank: Record<RiskLevel, number> = { High: 0, Medium: 1, Low: 2 };

/** Filters, then sorts by rule rating (High first) and age (oldest first). */
export function filterQueue(items: QueueItem[], f: QueueFilter): QueueItem[] {
  const q = f.query.trim().toLowerCase();
  return items
    .filter((r) => f.rating === "all" || r.rule === f.rating)
    .filter(
      (r) =>
        f.status === "all" || (f.status === "open" ? r.status !== "Closed" : r.status === f.status),
    )
    .filter((r) => !q || r.id.toLowerCase().includes(q) || r.client.toLowerCase().includes(q))
    .toSorted((a, b) => rank[a.rule] - rank[b.rule] || a.flagged.getTime() - b.flagged.getTime());
}

export function openCountByRating(items: QueueItem[]): Record<RiskLevel, number> {
  const open = items.filter((r) => r.status !== "Closed");
  return {
    High: open.filter((r) => r.rule === "High").length,
    Medium: open.filter((r) => r.rule === "Medium").length,
    Low: open.filter((r) => r.rule === "Low").length,
  };
}

/** "12 min", "5h 3m", "2d 4h". */
export function formatAge(flagged: Date, now: Date): string {
  const m = Math.round((now.getTime() - flagged.getTime()) / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const formatAmount = (czk: number) =>
  czk.toLocaleString("en-US", { minimumFractionDigits: 2 });
