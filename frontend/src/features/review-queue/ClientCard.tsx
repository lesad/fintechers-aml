import { cva } from "class-variance-authority";

import { Card, RiskBadge, type RiskLevel } from "@/components";

import { czk, type DetailClient } from "./api";

const money = (halere: number) => Math.round(czk(halere)).toLocaleString("en-US");

const pep = cva("", { variants: { pep: { true: "font-bold" } } });

/** `legal entity` → `Legal entity` */
const sentence = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

const riskLevel = (risk: string | null): RiskLevel | null =>
  risk === "high" ? "High" : risk === "medium" ? "Medium" : risk === "low" ? "Low" : null;

/** Who the client is and how Q2 compared with what they declared at onboarding. */
export function ClientCard({ client }: { client: DetailClient }) {
  const expectedQ2 = client.expectedMonthlyHalere * 3;
  const hasQ2 = client.q2TxCount > 0;
  const scale = Math.max(expectedQ2, client.q2VolumeHalere, 1);
  const deltaPct =
    hasQ2 && expectedQ2 ? Math.round((client.q2VolumeHalere / expectedQ2 - 1) * 100) : 0;
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
      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-fg-subtle">Volume, Q2 2026</span>
          {hasQ2 && (
            <span className="text-xs font-bold tabular-nums">
              {deltaPct >= 0 ? "+" : ""}
              {deltaPct} % vs expected
            </span>
          )}
        </div>
        {hasQ2 ? (
          <>
            <div className="grid grid-cols-[64px_minmax(0,1fr)_92px] items-center gap-2 text-xs">
              <span className="text-fg-muted">Expected</span>
              <span className="h-2 overflow-hidden rounded-[2px] bg-border-soft">
                <span
                  className="block h-full bg-fg-subtle"
                  style={{ width: `${(expectedQ2 / scale) * 100}%` }}
                />
              </span>
              <span className="text-right text-fg-muted tabular-nums">{money(expectedQ2)}</span>
              <span className="text-fg-muted">Real</span>
              <span className="h-2 overflow-hidden rounded-[2px] bg-border-soft">
                <span
                  className="block h-full bg-fg"
                  style={{ width: `${(client.q2VolumeHalere / scale) * 100}%` }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums">
                {money(client.q2VolumeHalere)}
              </span>
            </div>
            <span className="text-[11px] text-fg-subtle">
              Expected {money(client.expectedMonthlyHalere)} CZK / month × 3 · {client.q2TxCount}{" "}
              transactions in Q2
            </span>
          </>
        ) : (
          <span className="text-xs text-fg-muted">
            No Q2 history. Expected {money(client.expectedMonthlyHalere)} CZK / month.
          </span>
        )}
      </div>
    </Card>
  );
}
