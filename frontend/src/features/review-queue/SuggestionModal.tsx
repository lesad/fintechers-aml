import { cva } from "class-variance-authority";

import { AiLabel, Card, ConditionCode, ConditionLegend, Modal } from "@/components";
import { type ParamValue, paramText } from "@/utils";

import type { Impact, ImpactCounts, SuggestedRule, Suggestion } from "./api";
import type { ReactNode } from "react";

type SuggestionModalProps = {
  suggestion: Suggestion;
  onClose: () => void;
};

/** The engine's checked rule change for a false positive; accepting it is not built yet. */
export function SuggestionModal({ suggestion, onClose }: SuggestionModalProps) {
  return (
    <Modal
      label="Rule suggestion"
      onClose={onClose}
      className="max-w-[640px]"
      header={<span className="text-sm font-bold">Rule suggestion</span>}
      footer={
        <div className="flex justify-end gap-2 border-t border-border-soft px-[18px] py-3">
          <button
            type="button"
            disabled
            title="Not available yet"
            className="h-8 cursor-pointer rounded-md border-0 bg-fg px-3 text-[13px] font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Accept
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-[18px] py-3">
        <SuggestionView suggestion={suggestion} />
      </div>
    </Modal>
  );
}

function SuggestionView({ suggestion }: { suggestion: Suggestion }) {
  const { rule, impact } = suggestion;
  return (
    <>
      <AiCard suggestion={suggestion} />
      {impact && <ImpactView impact={impact} />}
      {rule && <DetailsView suggestion={suggestion} rule={rule} />}
    </>
  );
}

const prose = cva("m-0 text-[13px] leading-normal text-fg", {
  variants: { strong: { true: "font-semibold" } },
});

const Prose = ({ children, strong }: { children: ReactNode; strong?: boolean }) => (
  <p className={prose({ strong })}>{children}</p>
);

/** The one AI card: the code's reason for declining, or the model's why and the new rule in plain words. */
function AiCard({ suggestion }: { suggestion: Suggestion }) {
  const suggested = suggestion.kind === "rule_version" && suggestion.rule !== null;
  return (
    <Card
      tone="ai"
      title={<AiLabel>{suggested ? "Suggested rule change" : "No rule change suggested"}</AiLabel>}
      className="gap-2"
    >
      {suggestion.declined ? (
        <Prose>{suggestion.declined}</Prose>
      ) : (
        suggestion.explanation.map((s) => <Prose key={s.text}>{s.text}</Prose>)
      )}
      {suggested && suggestion.ruleExplanation && (
        <Prose strong>{suggestion.ruleExplanation}</Prose>
      )}
    </Card>
  );
}

/** Collapsed: the draft itself, and on a decline what the model had proposed. */
function DetailsView({ suggestion, rule }: { suggestion: Suggestion; rule: SuggestedRule }) {
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer text-xs font-semibold text-fg-muted">Details</summary>
      <div className="flex flex-col gap-3 pt-2">
        {suggestion.declined && (
          <Section title="What the model proposed">
            {suggestion.explanation.map((s) => (
              <Prose key={s.text}>{s.text}</Prose>
            ))}
            {suggestion.ruleExplanation && <Prose>{suggestion.ruleExplanation}</Prose>}
          </Section>
        )}
        <RuleView
          rule={rule}
          previous={suggestion.previousParams ?? {}}
          retires={suggestion.retires}
        />
      </div>
    </details>
  );
}

const DISPOSITION: Record<string, string> = {
  AUTO_CLOSE: "auto-closed",
  REVIEW_LOW: "low",
  REVIEW_MEDIUM: "medium",
  REVIEW_HIGH: "high",
  ESCALATE: "escalated",
  UNTRIAGED: "not triaged",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Code-measured facts about the change against this run; no model wrote them. */
function ImpactView({ impact }: { impact: Impact }) {
  const rows: [string, ImpactCounts][] = [["This client", impact.client]];
  if (impact.company) rows.push(["All clients", impact.company]);

  return (
    <Section title="Effect on this run's alerts">
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
        <li>
          {impact.closesThisAlert
            ? "Closes this alert."
            : impact.stopsThisAlert
              ? "Stops this rule's hit on this alert; other rules still flag it."
              : "Does not stop this alert."}
        </li>
        {rows.map(([scope, counts]) => (
          <li key={scope}>
            {scope}: stops {plural(counts.hitsStopped, "hit")}, closes{" "}
            {plural(counts.alertsClosed, "other alert")}
            {counts.alertsClosed > 0 &&
              ` (${Object.entries(counts.closedByDisposition)
                .map(([d, n]) => `${n} ${DISPOSITION[d] ?? d}`)
                .join(", ")})`}
            {counts.hitsAdded > 0 && `, raises ${plural(counts.hitsAdded, "new hit")}`}.
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RuleView({
  rule,
  previous,
  retires,
}: {
  rule: SuggestedRule;
  previous: Record<string, ParamValue>;
  retires: Suggestion["retires"];
}) {
  const fields: [string, string][] = [
    ["Rule", `${rule.key} v${rule.version} (draft)`],
    ["Layer", rule.scopeClientId ? `${rule.layer}, client ${rule.scopeClientId}` : rule.layer],
    ["Replaces", rule.replacesKey ?? "—"],
    ["Retires", retires ? `${retires.key} v${retires.version}` : "—"],
    ["Grain", rule.anchor ? `${rule.grain}, anchor ${rule.anchor}` : rule.grain],
  ];

  return (
    <>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
        {fields.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="m-0 font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <Section title="Condition">
        <ConditionCode
          condition={rule.condition}
          variables={new Set(rule.variables.map((v) => v.name))}
        />
        <ConditionLegend />
      </Section>

      {Object.keys(rule.params).length > 0 && (
        <Section title="Parameters">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-fg-muted">
                <th className="py-1 font-semibold">Name</th>
                <th className="py-1 text-right font-semibold">Current</th>
                <th className="py-1 text-right font-semibold">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rule.params).map(([name, value]) => (
                <tr
                  key={name}
                  className={previous[name]?.value === value.value ? "" : "bg-sel font-semibold"}
                >
                  <td className="border-t border-border-soft py-1 font-mono text-xs">{name}</td>
                  <td className="border-t border-border-soft py-1 text-right tabular-nums">
                    {previous[name] ? paramText(previous[name]) : "new"}
                  </td>
                  <td className="border-t border-border-soft py-1 text-right tabular-nums">
                    {paramText(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {rule.variables.length > 0 && (
        <Section title="Variables">
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
            {rule.variables.map((v) => (
              <li key={v.name} className="font-mono break-words">
                {v.name} = {v.agg}({v.field}) where {v.filter},{" "}
                {v.window.kind === "day" ? "same day" : `(${v.window.from}, ${v.window.to}]`}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-fg-muted">{title}</span>
      {children}
    </div>
  );
}
