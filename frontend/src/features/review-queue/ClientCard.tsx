import { cva } from "class-variance-authority";

import { Card, RiskBadge } from "@/components";

import { type Client, COUNTRIES } from "./detail-mock";

const money = (n: number) => n.toLocaleString("en-US");

const pep = cva("", { variants: { pep: { true: "font-bold" } } });

/** Who the client is and how Q2 compared with what they declared at onboarding. */
export function ClientCard({ id, client }: { id: string; client: Client }) {
  const expectedQ2 = client.expectedMonthly * 3;
  const scale = Math.max(expectedQ2, client.q2 ?? 0, 1);
  const deltaPct =
    client.q2 !== null && expectedQ2 ? Math.round((client.q2 / expectedQ2 - 1) * 100) : 0;

  return (
    <Card raised title="Client" aside={<span className="ml-auto font-mono text-xs">{id}</span>}>
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-[13px]">
        <span className="text-fg-subtle">Country</span>
        <span>{COUNTRIES[client.country] ?? client.country}</span>
        <span className="text-fg-subtle">Type</span>
        <span>{client.type}</span>
        <span className="text-fg-subtle">Contract</span>
        <span className="tabular-nums">
          {client.contract} · {client.channel}
        </span>
        <span className="text-fg-subtle">PEP</span>
        <span className={pep({ pep: client.pep })}>{client.pep ? "Yes" : "No"}</span>
        <span className="self-center text-fg-subtle">AML risk score</span>
        <span>
          <RiskBadge level={client.risk} />
        </span>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-fg-subtle">Volume, Q2 2026</span>
          {client.q2 !== null && (
            <span className="text-xs font-bold tabular-nums">
              {deltaPct >= 0 ? "+" : ""}
              {deltaPct} % vs expected
            </span>
          )}
        </div>
        {client.q2 !== null ? (
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
                  style={{ width: `${(client.q2 / scale) * 100}%` }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums">{money(client.q2)}</span>
            </div>
            <span className="text-[11px] text-fg-subtle">
              Expected {money(client.expectedMonthly)} CZK / month × 3
            </span>
          </>
        ) : (
          <span className="text-xs text-fg-muted">
            No Q2 history. Expected {money(client.expectedMonthly)} CZK / month.
          </span>
        )}
      </div>
    </Card>
  );
}
