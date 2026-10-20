import { groupByKey, type RuleVersion } from "./api";
import { paramText } from "./format";

/** A version that ran, from its approval until the next version of its key was approved (null: still running). */
export type LiveSpan = { version: RuleVersion; from: string; until: string | null };

const liveFrom = (v: RuleVersion) => v.approvedAt ?? v.createdAt;
const ms = (iso: string) => new Date(iso).getTime();

/**
 * Every rule key that had a version running at [at], with that version and the key's history up to [at].
 *
 * @remarks Approval activates a version and retires the previous one (ADR-0044), so a version runs from its
 * approval to the next one's. A seeded version has no approval and counts from its creation.
 */
export function rulesValidAt(versions: RuleVersion[], at: Date) {
  return groupByKey(versions).flatMap(({ key, versions: all }) => {
    const ran = all
      .filter((v) => v.status === "active" || v.status === "retired")
      .toSorted((a, b) => ms(liveFrom(a)) - ms(liveFrom(b)));
    const spans: LiveSpan[] = ran.map((v, i) => {
      const next = ran[i + 1];
      return { version: v, from: liveFrom(v), until: next ? liveFrom(next) : null };
    });
    const history = spans.filter((s) => ms(s.from) <= at.getTime()).toReversed();
    const valid = history[0];
    return valid && (valid.until === null || ms(valid.until) > at.getTime())
      ? [{ key, valid, history }]
      : [];
  });
}

/** What a version changed against the one it replaced: each changed parameter, `condition`, `variables`. */
export function versionChanges(before: RuleVersion, after: RuleVersion): string[] {
  const params = [
    ...new Set([...Object.keys(before.params), ...Object.keys(after.params)]),
  ].flatMap((name) => {
    const [was, is] = [before.params[name], after.params[name]];
    if (was?.value === is?.value && was?.unit === is?.unit) return [];
    return [`${name} ${was ? paramText(was) : "—"} → ${is ? paramText(is) : "—"}`];
  });
  return [
    ...params,
    ...(before.condition !== after.condition || before.anchor !== after.anchor
      ? ["condition"]
      : []),
    ...(JSON.stringify(before.variables) !== JSON.stringify(after.variables) ? ["variables"] : []),
  ];
}
