import { useEffect, useState } from "react";

import { savedUser } from "@/user";

import { ASSESSMENT, ASK_WHO_LABEL, fetchAiResult, VERDICT_LABEL } from "./ai";
import {
  CHANNEL,
  CLIENT_TYPE,
  cs,
  csDateTime,
  czk,
  DIRECTION,
  evidenceLines,
  flowOf,
  hitSpan,
  RISK,
  TX_TYPE,
} from "./opo";
import { Section } from "./OpoReport";
import { useReportFacts } from "./use-report-facts";

import type {
  AlertStatus,
  CaseEvent,
  Disposition,
  HistoryTransaction,
  OpoRule,
  TransactionDetail,
} from "./api";
import type { ReactNode } from "react";
import type { z } from "zod";

type Assessment = z.infer<typeof ASSESSMENT.schema>;

const DISPOSITION: Record<Disposition, string> = {
  AUTO_CLOSE: "automaticky uzavřít",
  REVIEW_LOW: "k posouzení, nízká priorita",
  REVIEW_MEDIUM: "k posouzení, střední priorita",
  REVIEW_HIGH: "k posouzení, vysoká priorita",
  ESCALATE: "eskalovat",
};
const STATUS: Record<AlertStatus, string> = {
  NEW: "nový",
  ESCALATED: "eskalován",
  FALSE_POSITIVE: "falešně pozitivní",
  REPORTED: "oznámen FAÚ",
};
const ACTION: Record<CaseEvent["action"], string> = {
  ASSIGNED: "přidělen",
  REASSIGNED: "předán",
  NEW: "vrácen jako nový",
  ESCALATED: "eskalován",
  FALSE_POSITIVE: "uzavřen jako falešně pozitivní",
  REPORTED: "oznámen FAÚ",
};
const RATING: Record<string, string> = { high: "vysoké", medium: "střední", low: "nízké" };
const GRAIN: Record<OpoRule["grain"], string> = {
  transaction: "jednotlivý obchod",
  client_day: "kalendářní den klienta",
  client_anchor: "okno kolem obchodu",
};

const button =
  "h-7 rounded border border-border bg-bg px-3 text-[13px] font-semibold text-fg hover:border-fg";
const th =
  "border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold text-fg-subtle uppercase";
const td = "border-b border-border-soft px-2 py-1.5 align-top";

function Rows({ rows }: { rows: Record<string, ReactNode> }) {
  return (
    <dl className="grid grid-cols-[240px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {Object.entries(rows).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-fg-muted">{label}</dt>
          <dd>{value ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

const yesNo = (b: boolean) => (b ? "ano" : "ne");

type Stored =
  | { status: "loading" }
  | { status: "ready"; byAlert: Map<number, Assessment | null | Error> };

/** The AI assessments stored for the alerts; only read, an audit never generates one. */
function useStoredAssessments(alertIds: number[]) {
  const key = alertIds.join(",");
  const [stored, setStored] = useState<Stored>({ status: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    const ids = key ? key.split(",").map(Number) : [];
    void Promise.all(
      ids.map((id) =>
        fetchAiResult(id, ASSESSMENT, ctrl.signal).catch((err: unknown) =>
          err instanceof Error ? err : new Error(String(err)),
        ),
      ),
    ).then((results) => {
      if (!ctrl.signal.aborted)
        setStored({ status: "ready", byAlert: new Map(ids.map((id, i) => [id, results[i]!])) });
    });
    return () => ctrl.abort();
  }, [key]);
  return stored;
}

type AuditReportProps = { detail: TransactionDetail; onClose: () => void };

/**
 * Everything the app holds on one case for an audit or a supervisory inspection: the transaction, the client, the
 * client's surrounding activity, each rule that fired with its inputs, the triage, the AI assessments and the
 * decision log, printed to PDF.
 *
 * @remarks Unlike {@link OpoReport} it names every employee who acted on the case, so it is internal and must not go
 * into a FAÚ filing (§ 18(3)).
 */
export function AuditReport({ detail, onClose }: AuditReportProps) {
  const current = detail.day.find((t) => t.id === detail.transaction.id);
  const facts = useReportFacts(detail.transaction.id, current);
  const ai = useStoredAssessments(detail.alerts.map((a) => a.id));

  return (
    <div className="flex flex-col gap-4 px-6 pt-4 pb-8 print:p-0">
      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={facts.status !== "ready" || ai.status !== "ready"}
            onClick={() => window.print()}
            className="h-7 rounded bg-indigo px-3 text-[13px] font-semibold text-white hover:bg-indigo-hover disabled:bg-retired-dot"
          >
            Print / Save as PDF
          </button>
          <button type="button" onClick={onClose} className={button}>
            Close
          </button>
        </div>
        <p className="max-w-[1040px] text-xs text-fg-muted">
          Audit trail for an inspection by ČNB or FAÚ. It names the employees who worked the case,
          so it is internal: never attach it to the FAÚ report (§ 18(3)).
        </p>
      </div>

      {(facts.status === "loading" || ai.status === "loading") && (
        <p className="text-xs text-fg-subtle">Loading the rules and the client's activity…</p>
      )}
      {facts.status === "error" && (
        <p className="text-xs text-high">Could not load the audit trail: {facts.message}</p>
      )}
      {facts.status === "ready" && ai.status === "ready" && (
        <Audit detail={detail} rules={facts.rules} txs={facts.txs} ai={ai.byAlert} />
      )}
    </div>
  );
}

function Audit({
  detail,
  rules,
  txs,
  ai,
}: {
  detail: TransactionDetail;
  rules: OpoRule[];
  txs: HistoryTransaction[];
  ai: Map<number, Assessment | null | Error>;
}) {
  const { transaction: tx, client } = detail;
  const ruleOf = (key: string, version: number) =>
    rules.find((r) => r.key === key && r.version === version);
  const spans = detail.alerts.flatMap((a) =>
    a.hits.flatMap((h) => {
      const rule = ruleOf(h.rule, h.version);
      const span = rule && hitSpan(h, rule, txs);
      return span ? [span] : [];
    }),
  );
  const context = [
    ...new Map([...flowOf(spans, txs), ...detail.day].map((t) => [t.id, t] as const)).values(),
  ].toSorted((a, b) => a.ts.localeCompare(b.ts));
  const log = detail.log.toReversed();

  return (
    <article
      aria-label="Audit trail"
      className="flex max-w-[1040px] flex-col gap-6 rounded-md border border-border bg-bg p-8 print:max-w-none print:border-0 print:p-0"
    >
      <header className="flex flex-col gap-1 border-b-2 border-indigo pb-3">
        <h1 className="text-xl font-bold">Auditní záznam případu</h1>
        <div className="text-sm">
          Obchod <strong className="font-mono">{tx.id}</strong> · klient{" "}
          <span className="font-mono">{client.id}</span> · stav případu{" "}
          <strong>{detail.status ? STATUS[detail.status] : "bez výstrahy"}</strong>
        </div>
        <div className="text-xs text-fg-subtle">
          Vygenerováno {csDateTime(new Date().toISOString())} · vygeneroval{" "}
          {savedUser()?.name ?? "neuvedeno"} · interní dokument, obsahuje jména zaměstnanců
        </div>
      </header>

      <Section title="1. Obchod">
        <Rows
          rows={{
            "Datum a čas": csDateTime(tx.ts),
            "Druh obchodu": cs(TX_TYPE, tx.type),
            Směr: DIRECTION[tx.direction],
            "Částka a měna": `${tx.volume.toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} ${tx.currency}`,
            "Částka v CZK": `${czk(tx.amount)} (kurz ${tx.fxRate.toLocaleString("cs-CZ")})`,
            "Účet plátce":
              tx.payerAccount && `${tx.payerAccount} (${tx.payerCountry ?? "stát neuveden"})`,
            "Účet příjemce":
              tx.payeeAccount && `${tx.payeeAccount} (${tx.payeeCountry ?? "stát neuveden"})`,
          }}
        />
      </Section>

      <Section title="2. Klient">
        <Rows
          rows={{
            "Číslo klienta": <span className="font-mono">{client.id}</span>,
            "Typ klienta": cs(CLIENT_TYPE, client.type),
            Stát: client.country,
            "Politicky exponovaná osoba": yesNo(client.pep),
            "Rizikový profil": cs(RISK, client.risk),
            "Klientem od": client.contractDate,
            "Vztah navázán": cs(CHANNEL, client.channel),
            "Deklarovaný měsíční objem": czk(client.expectedMonthly),
            "Deklarovaný měsíční počet obchodů": client.expectedCount,
            [`Skutečnost Q2 (${client.q2Days} dní)`]: `${czk(client.q2Volume)} v ${client.q2TxCount} obchodech, nejvyšší ${czk(client.q2MaxTx)}`,
            "Obchodů klienta celkem": detail.historyCount,
          }}
        />
      </Section>

      <Section title="3. Obchody klienta v den obchodu a v oknech pravidel">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={th}>Datum a čas</th>
              <th className={th}>Obchod</th>
              <th className={th}>Směr</th>
              <th className={th}>Účet protistrany</th>
              <th className={th}>Stát</th>
              <th className={th}>Výstrahy</th>
              <th className={`${th} text-right`}>Částka</th>
            </tr>
          </thead>
          <tbody>
            {context.map((t) => (
              <tr key={t.id} className={t.id === tx.id ? "font-semibold" : undefined}>
                <td className={td}>{csDateTime(t.ts)}</td>
                <td className={`${td} font-mono`}>{t.id}</td>
                <td className={td}>{DIRECTION[t.direction]}</td>
                <td className={`${td} font-mono`}>{t.counterpartyAccount ?? "–"}</td>
                <td className={td}>{t.counterpartyCountry ?? "–"}</td>
                <td className={td}>{t.alertTypes.join(", ") || "–"}</td>
                <td className={`${td} text-right whitespace-nowrap`}>{czk(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="4. Spuštěná pravidla a jejich vstupy">
        {detail.alerts.length === 0 && <p className="text-[13px]">Žádné pravidlo nezasáhlo.</p>}
        {detail.alerts.map((a) => (
          <div key={a.id} className="flex flex-col gap-3">
            <h3 className="text-[13px] font-bold">
              Výstraha #{a.id} typu {a.alertType} · vytvořena {csDateTime(a.createdAt)} · stav{" "}
              {STATUS[a.status]} · hodnocení pravidel {a.rating ?? "–"}
            </h3>
            {a.hits.map((h) => {
              const rule = ruleOf(h.rule, h.version);
              return (
                <div
                  key={`${h.rule}-${h.grainKey}`}
                  className="flex break-inside-avoid flex-col gap-1 border-l-2 border-border pl-3 text-[13px]"
                >
                  <span className="font-semibold">
                    Pravidlo {h.rule} verze {h.version}
                    {h.name && ` „${h.name}“`} · posuzováno: {rule ? GRAIN[rule.grain] : "–"}{" "}
                    <span className="font-mono">{h.grainKey}</span>
                  </span>
                  {rule ? (
                    <span>
                      Podmínka: <code className="font-mono text-xs">{rule.condition}</code>
                    </span>
                  ) : (
                    <span className="text-high">Verze pravidla nebyla nalezena.</span>
                  )}
                  <ul className="list-disc pl-5">
                    {evidenceLines(h, rule).map(([label, value]) => (
                      <li key={label}>
                        {label}: <strong>{value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </Section>

      <Section title="5. Triáž">
        {detail.alerts.map((a) =>
          a.triage ? (
            <div key={a.id} className="flex break-inside-avoid flex-col gap-2">
              <Rows
                rows={{
                  Výstraha: `#${a.id} typu ${a.alertType}`,
                  "Skóre triáže": `${a.triage.score} / 100`,
                  Směrování: DISPOSITION[a.triage.disposition],
                  "Verze nastavení triáže": a.triage.configVersion,
                  "Rozhodnuto triáží": a.triage.decidedAt && csDateTime(a.triage.decidedAt),
                }}
              />
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={th}>Kód</th>
                    <th className={th}>Důvod</th>
                    <th className={`${th} text-right`}>Body</th>
                  </tr>
                </thead>
                <tbody>
                  {a.triage.reasons.map((r) => (
                    <tr key={r.code}>
                      <td className={`${td} font-mono`}>{r.code}</td>
                      <td className={td}>{r.description}</td>
                      <td className={`${td} text-right tabular-nums`}>{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p key={a.id} className="text-[13px]">
              Výstraha #{a.id}: triáž neproběhla.
            </p>
          ),
        )}
      </Section>

      <Section title="6. Posouzení AI (jen návrh, nerozhoduje)">
        {detail.alerts.map((a) => (
          <AiAssessment key={a.id} alertId={a.id} result={ai.get(a.id)} />
        ))}
      </Section>

      <Section title="7. Průběh případu">
        {log.length === 0 ? (
          <p className="text-[13px]">Na případu nikdo nejednal.</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>Čas</th>
                <th className={th}>Úkon</th>
                <th className={th}>Kdo</th>
                <th className={th}>Komu přidělen</th>
                <th className={th}>Odůvodnění</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => (
                <tr key={`${e.at}-${e.action}`}>
                  <td className={`${td} whitespace-nowrap`}>{csDateTime(e.at)}</td>
                  <td className={td}>
                    {ACTION[e.action]}
                    {e.postponed === true && ", příkaz odložen (§ 20)"}
                  </td>
                  <td className={td}>{e.actor ?? "systém"}</td>
                  <td className={td}>{e.assignee ?? "–"}</td>
                  <td className={`${td} whitespace-pre-line`}>{e.reason ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </article>
  );
}

function AiAssessment({
  alertId,
  result,
}: {
  alertId: number;
  result: Assessment | null | Error | undefined;
}) {
  if (result instanceof Error)
    return (
      <p className="text-[13px] text-high">
        Výstraha #{alertId}: posouzení se nepodařilo načíst ({result.message}).
      </p>
    );
  if (!result) return <p className="text-[13px]">Výstraha #{alertId}: AI posouzení neproběhlo.</p>;
  const meta = {
    Výstraha: `#${alertId}`,
    Vytvořeno: csDateTime(result.createdAt),
    Model: <span className="font-mono">{result.modelId}</span>,
    "Otisk promptu / vstupu": (
      <span className="font-mono text-xs">
        {result.promptHash} / {result.inputHash}
      </span>
    ),
  };
  if (result.status !== "ready")
    return (
      <Rows
        rows={{
          ...meta,
          Výsledek: `${result.status === "rejected" ? "odmítnut kontrolou" : "selhal"}: ${result.error ?? "bez udání důvodu"}`,
        }}
      />
    );
  const { body } = result;
  return (
    <div className="flex break-inside-avoid flex-col gap-2 text-[13px]">
      <Rows
        rows={{
          ...meta,
          "Hodnocení AI": RATING[body.rating],
          Vzorec: VERDICT_LABEL[body.verdict],
          Shrnutí: (
            <ul className="list-disc pl-5">
              {body.summary.map((c) => (
                <li key={c.text}>
                  {c.text}
                  {c.refs.length > 0 && (
                    <span className="font-mono text-xs text-fg-subtle"> [{c.refs.join(", ")}]</span>
                  )}
                </li>
              ))}
            </ul>
          ),
          "Otevřené otázky":
            body.openPoints.length === 0 ? null : (
              <ul className="list-disc pl-5">
                {body.openPoints.map((p) => (
                  <li key={p.question.text}>
                    {p.question.text} ({ASK_WHO_LABEL[p.askWho]})
                  </li>
                ))}
              </ul>
            ),
          "Výhrady kontroly":
            body.warnings.length === 0 ? null : (
              <ul className="list-disc pl-5">
                {body.warnings.map((w) => (
                  <li key={`${w.at}-${w.message}`}>
                    {w.at}: {w.message}
                  </li>
                ))}
              </ul>
            ),
        }}
      />
    </div>
  );
}
