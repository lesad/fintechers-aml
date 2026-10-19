import { cva } from "class-variance-authority";

import { Card, RiskBadge, type RiskLevel } from "@/components";

import { czk, type DetailClient } from "./api";

const money = (halere: number) => Math.round(czk(halere)).toLocaleString("en-US");
const count = (n: number) => n.toLocaleString("en-US");

const pep = cva("", { variants: { pep: { true: "font-bold" } } });

/** `legal entity` → `Legal entity` */
const sentence = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

const riskLevel = (risk: string | null): RiskLevel | null =>
  risk === "high" ? "High" : risk === "medium" ? "Medium" : risk === "low" ? "Low" : null;

/** Who the client is and how Q2 compared with what they declared at onboarding. */
export function ClientCard({ client }: { client: DetailClient }) {
  const hasQ2 = client.q2TxCount > 0;
  const risk = riskLevel(client.risk);

  return (
    <Card
      raised
      title="Client"
      aside={<span className="ml-auto font-mono text-xs">{client.id}</span>}
    >
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[13px]">
        <span className="text-fg-subtle">Country</span>
        <span>{client.country ?? "—"}</span>
        <span className="text-fg-subtle">Type</span>
        <span>{sentence(client.type)}</span>
        <span className="text-fg-subtle">Contract</span>
        <span className="tabular-nums">
          {client.contractDate ?? "—"} · {sentence(client.channel)}
        </span>
        <span className="text-fg-subtle">PEP</span>
        <span className={pep({ pep: client.pep })}>{client.pep ? "Yes" : "No"}</span>
        <span className="self-center text-fg-subtle">AML risk score</span>
        <span>{risk ? <RiskBadge level={risk} /> : "—"}</span>
      </div>
      <Comparison
        title="Volume, Q2 2026"
        expected={client.expectedMonthlyHalere * 3}
        real={hasQ2 ? client.q2VolumeHalere : null}
        format={money}
      />
      <Comparison
        title="Transactions, Q2 2026"
        expected={client.expectedCount * 3}
        real={hasQ2 ? client.q2TxCount : null}
        format={count}
      />
    </Card>
  );
}

type ComparisonProps = {
  title: string;
  /** What the client declared for the quarter. */
  expected: number;
  /** null when the client has no Q2 history. */
  real: number | null;
  format: (n: number) => string;
};

function Comparison({ title, expected, real, format }: ComparisonProps) {
  const scale = Math.max(expected, real ?? 0, 1);
  const deltaPct = real !== null && expected ? Math.round((real / expected - 1) * 100) : null;
  return (
    <div
      role="group"
      aria-label={title}
      className="flex flex-col gap-1.5 border-t border-border-soft pt-2.5"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-fg-subtle">{title}</span>
        {deltaPct !== null && (
          <span className="text-xs font-bold tabular-nums">
            {deltaPct >= 0 ? "+" : ""}
            {deltaPct} % vs expected
          </span>
        )}
      </div>
      <div className="grid grid-cols-[64px_minmax(0,1fr)_92px] items-center gap-2 text-xs">
        <span className="text-fg-muted">Expected</span>
        <Bar share={expected / scale} tone="expected" />
        <span className="text-right text-fg-muted tabular-nums">{format(expected)}</span>
        {real !== null && (
          <>
            <span className="text-fg-muted">Real</span>
            <Bar share={real / scale} tone="real" />
            <span className="text-right font-semibold tabular-nums">{format(real)}</span>
          </>
        )}
      </div>
      {real === null && <span className="text-xs text-fg-muted">No Q2 history.</span>}
    </div>
  );
}

const bar = cva("block h-full", {
  variants: { tone: { expected: "bg-fg-subtle", real: "bg-fg" } },
});

function Bar({ share, tone }: { share: number; tone: "expected" | "real" }) {
  return (
    <span className="h-2 overflow-hidden rounded-[2px] bg-border-soft">
      <span className={bar({ tone })} style={{ width: `${share * 100}%` }} />
    </span>
  );
}
