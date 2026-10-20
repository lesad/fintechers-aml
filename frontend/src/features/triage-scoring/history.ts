import type { TriageConfigVersion } from "./api";
import type { VersionHistoryItem, VersionStatus, VersionTab } from "@/components";

/** One rule a version rescores: what the version it is read against gives it, and what this one does. */
export type ScoreChange = { ruleKey: string; from: number | null; to: number };

/** How many changed scores a history line names before it counts the rest. */
const NAMED = 3;

/** What [version] changes about [against]'s scores, in key order. A score only this one has reads `from: null`. */
export function scoreChanges(
  against: TriageConfigVersion,
  version: TriageConfigVersion,
): ScoreChange[] {
  return version.rules
    .flatMap((r) => {
      const from = against.rules.find((a) => a.ruleKey === r.ruleKey)?.baseScore ?? null;
      return from === r.baseScore ? [] : [{ ruleKey: r.ruleKey, from, to: r.baseScore }];
    })
    .toSorted((a, b) => a.ruleKey.localeCompare(b.ruleKey));
}

/** `A1 8 → 30` — one changed score as a line names it. */
export const changeText = (c: ScoreChange) => `${c.ruleKey} ${c.from ?? "not set"} → ${c.to}`;

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-10-20T09:00:00+02:00` → `2026-10-20 09:00`, the form the design's history rows carry. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * What one version did, in a line: the scores it moved against the version before it, or — for the first one —
 * how much policy it carried. A version that moved no score says so; it changed something this page does not edit.
 */
export function noteOf(
  version: TriageConfigVersion,
  previous: TriageConfigVersion | undefined,
): string {
  if (!previous) return `First version · ${version.rules.length} rules scored`;
  const changes = scoreChanges(previous, version);
  if (changes.length === 0) return `No score changed against v${previous.version}`;
  const named = changes.slice(0, NAMED).map(changeText).join(", ");
  const rest = changes.length - NAMED;
  return rest > 0 ? `${named} and ${rest} more` : named;
}

/**
 * Who wrote the version and where it stands, as the line beside the version pills reads it. A version waiting for
 * its approver names them — that is the whole point of the line: everyone can see who it is with.
 */
export function bylineOf(version: TriageConfigVersion): string {
  const by = version.author ?? "unknown";
  const when = stamp(version.createdAt);
  switch (version.status) {
    case "pending":
      return `Submitted by ${by}, ${when} · reviewer ${version.assignee ?? "unassigned"}`;
    case "draft":
      return `Drafted by ${by}, ${when}`;
    case "active":
      return version.approver && version.approvedAt
        ? `Active since ${stamp(version.approvedAt)} · by ${by} · approved by ${version.approver}`
        : `Active since ${when} · by ${by}`;
    default:
      return `Created ${when} · by ${by}`;
  }
}

/**
 * The versions the header switches between: the one being decided and the live one, plus whatever the history has
 * opened when that is neither, so the strip always shows where the reader is. Newest first.
 */
export function versionTabsOf(
  versions: TriageConfigVersion[],
  shown: TriageConfigVersion,
): VersionTab[] {
  const open = versions.filter((v) => v.status === "draft" || v.status === "pending");
  const live = versions.filter((v) => v.status === "active");
  const head = [...open, ...live];
  return (head.some((v) => v.version === shown.version) ? head : [...head, shown])
    .toSorted((a, b) => b.version - a.version)
    .map((v) => ({ version: v.version, status: v.status as VersionStatus }));
}

/**
 * The stored versions as the history reads them, newest first. Each line is read against the version below it,
 * which is the version it was derived from: the config is insert-only, so that is the whole of its ancestry.
 */
export function historyOf(versions: TriageConfigVersion[]): VersionHistoryItem[] {
  const byVersion = versions.toSorted((a, b) => b.version - a.version);
  return byVersion.map((v, i) => ({
    version: v.version,
    status: v.status as VersionStatus,
    note: noteOf(v, byVersion[i + 1]),
    author: v.author ?? "unknown",
    date: stamp(v.createdAt),
  }));
}
