import { useEffect, useState } from "react";

import { fetchHistory, fetchOpoRules } from "./api";
import { csDateTime, czk, evidenceLines, flowOf, type HitFacts, splitHits } from "./opo";

import type { HistoryTransaction, OpoRule, TransactionDetail } from "./api";
import type { ReactNode } from "react";

// Demo data: the bank and its contact details are made up, like the app's users.
const BANK = {
  name: "Ukázková banka, a.s.",
  seat: "Na Příkopě 1, 110 00 Praha 1",
  id: "000 00 000",
  business: "činnost banky podle zákona č. 21/1992 Sb., o bankách",
};
const CONTACT = {
  position: "AML manažer, kontaktní osoba podle § 22",
  phone: "+420 222 000 111",
  email: "aml@banka.example",
};

const DIRECTION: Record<HistoryTransaction["direction"], string> = {
  in: "příchozí",
  out: "odchozí",
  // NOTE: the importer gives only remittances no direction.
  unknown: "remitence",
};
const TX_TYPE: Record<string, string> = {
  "incoming payment": "příchozí platba",
  "outgoing payment": "odchozí platba",
  remittance: "remitence (převod peněz)",
};
const CLIENT_TYPE: Record<string, string> = {
  "natural person": "fyzická osoba",
  enterpreneur: "fyzická osoba podnikající",
  "legal entity": "právnická osoba",
};
const CHANNEL: Record<string, string> = { "distant form": "na dálku", "in person": "osobně" };
const RISK: Record<string, string> = { low: "nízký", medium: "střední", high: "vysoký" };

const cs = (map: Record<string, string>, v: string | null) => (v === null ? null : (map[v] ?? v));

const button =
  "h-7 rounded border border-border bg-bg px-3 text-[13px] font-semibold text-fg hover:border-fg";
const th =
  "border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold text-fg-subtle uppercase";
const td = "border-b border-border-soft px-2 py-1.5 align-top";

/** A field the report must carry but the dataset does not hold: printed as a gap the filer fills in. */
function Missing({ what }: { what: string }) {
  return (
    <span
      data-testid="missing"
      className="inline-block rounded-sm border border-dashed border-high bg-[repeating-linear-gradient(135deg,var(--color-high-bg)_0_6px,transparent_6px_12px)] px-1.5 text-xs text-high italic [print-color-adjust:exact]"
    >
      chybí v datech: {what}
    </span>
  );
}

function Fields({ rows }: { rows: Record<string, ReactNode> }) {
  return (
    <dl className="grid grid-cols-[240px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {Object.entries(rows).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-fg-muted">{label}</dt>
          <dd>{value ?? <Missing what={label.toLowerCase()} />}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="border-b border-border pb-1 text-sm font-bold break-after-avoid">{title}</h2>
      {children}
    </section>
  );
}

/** The client's identity as the FAÚ template asks for it, by client type; the dataset holds none of it. */
function subjectRows(client: TransactionDetail["client"]): Record<string, ReactNode> {
  const residence = `Trvalý pobyt (sídlo) ${client.country === "CZ" ? "v ČR" : "mimo ČR"}`;
  const person = {
    "Jméno a příjmení": <Missing what="jméno a příjmení" />,
    [residence]: <Missing what="adresa trvalého pobytu" />,
    "Rodné číslo nebo datum narození": <Missing what="rodné číslo nebo datum narození" />,
    "Doklad totožnosti (číslo, vydal, dne, platnost)": <Missing what="údaje dokladu totožnosti" />,
    "Státní příslušnost": <Missing what="státní příslušnost" />,
  };
  const business = {
    IČO: <Missing what="IČO" />,
    "Předmět podnikání": <Missing what="předmět podnikání" />,
  };
  const identity: Record<string, ReactNode> =
    client.type === "legal entity"
      ? {
          "Obchodní firma": <Missing what="obchodní firma" />,
          [residence]: <Missing what="adresa sídla" />,
          ...business,
        }
      : client.type === "enterpreneur"
        ? { ...person, ...business }
        : person;
  return {
    ...identity,
    "Číslo klienta v bance": <span className="font-mono">{client.id}</span>,
    "Typ klienta": cs(CLIENT_TYPE, client.type),
    "Stát podle evidence klienta": client.country,
    "Politicky exponovaná osoba": client.pep ? "ano" : "ne",
    "Rizikový profil klienta": cs(RISK, client.risk),
    "Klientem od": client.contractDate && csDateTime(`${client.contractDate}T00:00`).slice(0, -6),
    "Vztah navázán": cs(CHANNEL, client.channel),
    "Deklarovaný měsíční objem": czk(client.expectedMonthly),
  };
}

function Grounds({ facts, flagged }: { facts: HitFacts; flagged: string }) {
  const { hit, rule } = facts;
  return (
    <div className="flex break-inside-avoid flex-col gap-1 text-[13px]">
      <span className="font-semibold">
        Pravidlo {hit.rule} verze {hit.version}
        {hit.name && ` „${hit.name}“`} · výstraha vytvořena {flagged}
      </span>
      {rule && (
        <span>
          Podmínka pravidla: <code className="font-mono text-xs">{rule.condition}</code>
        </span>
      )}
      <ul className="list-disc pl-5">
        {evidenceLines(hit, rule).map(([label, value]) => (
          <li key={label}>
            {label}: <strong>{value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** § 20: whether the compliance officer held the client's order; a report saved before the question existed has no answer. */
function Execution({ postponed, ts }: { postponed: boolean | null | undefined; ts: string }) {
  if (postponed === true)
    return (
      <strong>Odložen: příkaz bude proveden nejdříve 24 hodin po přijetí oznámení Úřadem</strong>
    );
  if (postponed === false) return `Proveden ${csDateTime(ts)}`;
  return <Missing what="rozhodnutí o provedení či odkladu" />;
}

type Facts =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rules: OpoRule[]; txs: HistoryTransaction[] };

const AROUND = 200;

/** The rule versions and the client's transactions around the reported one (up to 200 a side). */
function useFacts(id: string, current: HistoryTransaction | undefined) {
  const [facts, setFacts] = useState<Facts>({ status: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      fetchOpoRules(ctrl.signal),
      fetchHistory(id, { side: "older", limit: AROUND }, ctrl.signal),
      fetchHistory(id, { side: "newer", limit: AROUND }, ctrl.signal),
    ])
      .then(([rules, older, newer]) =>
        setFacts({
          status: "ready",
          rules,
          txs: [...newer.items, ...(current ? [current] : []), ...older.items],
        }),
      )
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted)
          setFacts({ status: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => ctrl.abort();
  }, [id, current]);
  return facts;
}

type OpoReportProps = { detail: TransactionDetail; onClose: () => void };

/**
 * Draft of a suspicious transaction report (OPO) for FAÚ under § 18 of Act 253/2008, laid out as FAÚ's
 * template, printed to PDF.
 *
 * @remarks Never names who detected or escalated the case (§ 18(3)): the decision log stays out, and the
 * only person named is the contact person, the compliance officer who filed the report. Grounds are the hits whose rule
 * window holds the reported transaction; the client's other hits go under further information.
 */
export function OpoReport({ detail, onClose }: OpoReportProps) {
  const current = detail.day.find((t) => t.id === detail.transaction.id);
  const facts = useFacts(detail.transaction.id, current);

  return (
    <div className="flex flex-col gap-4 px-6 pt-4 pb-8 print:p-0">
      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={facts.status !== "ready"}
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
          Draft for the contact person: fill in the marked gaps from core banking, sign it and file
          it on the OPO form by data box without undue delay (§ 18(1)); FAÚ reads that as at most 5
          calendar days. It names nobody who detected the case (§ 18(3)). Filing it is confidential
          (§ 38): the client must not learn of it.
        </p>
      </div>

      {facts.status === "loading" && <p className="text-xs text-fg-subtle">Loading the rules…</p>}
      {facts.status === "error" && (
        <p className="text-xs text-high">Could not load the report: {facts.message}</p>
      )}
      {facts.status === "ready" && current && (
        <Report detail={detail} current={current} rules={facts.rules} txs={facts.txs} />
      )}
    </div>
  );
}

function Report({
  detail,
  current,
  rules,
  txs,
}: {
  detail: TransactionDetail;
  current: HistoryTransaction;
  rules: OpoRule[];
  txs: HistoryTransaction[];
}) {
  const { transaction: tx, client } = detail;
  const report = detail.log.find((e) => e.action === "REPORTED");
  const flagged = new Map(
    detail.alerts.flatMap((a) => a.hits.map((h) => [h, csDateTime(a.createdAt)] as const)),
  );
  const { grounds, other } = splitHits(
    detail.alerts.flatMap((a) => a.hits),
    {
      rules,
      txs,
      reported: current,
    },
  );
  const spans = grounds.flatMap((g) => (g.span ? [g.span] : []));
  const flow = spans.length > 0 ? flowOf(spans, txs) : [current];
  const parties = [
    ...new Map(
      flow
        .filter((t) => t.id !== tx.id && t.counterpartyAccount)
        .map((t) => [`${t.counterpartyAccount}-${t.direction}`, t] as const),
    ).values(),
  ];

  return (
    <article
      aria-label="FAÚ report"
      className="flex max-w-[1040px] flex-col gap-6 rounded-md border border-border bg-bg p-8 print:max-w-none print:border-0 print:p-0"
    >
      <header className="flex flex-col gap-1 border-b-2 border-indigo pb-3">
        <h1 className="text-xl font-bold">Oznámení podezřelého obchodu</h1>
        <div className="text-sm">
          podle § 18 zákona č. 253/2008 Sb. · Finanční analytický úřad · interní označení{" "}
          <strong className="font-mono">{tx.id}</strong>
        </div>
        <div className="text-xs text-fg-subtle">
          Vygenerováno {csDateTime(new Date().toISOString())} · návrh k podání formulářem OPO
          datovou schránkou
        </div>
      </header>

      <Section title="1. Identifikační údaje povinné osoby">
        <Fields
          rows={{
            "Obchodní firma": BANK.name,
            Sídlo: BANK.seat,
            IČO: BANK.id,
            "Předmět podnikání": BANK.business,
          }}
        />
      </Section>

      <Section title="2. Identifikační údaje toho, koho se oznámení týká">
        <Fields rows={subjectRows(client)} />
      </Section>

      <Section title="3. Osoba jednající jménem klienta">
        <Fields
          rows={
            client.type === "legal entity"
              ? {
                  "Jméno, příjmení a funkce": <Missing what="statutární orgán nebo zástupce" />,
                  "Trvalý pobyt, rodné číslo nebo datum narození": (
                    <Missing what="údaje zástupce" />
                  ),
                  "Doklad totožnosti a státní příslušnost": <Missing what="doklad zástupce" />,
                }
              : {
                  "Zástupce klienta": <Missing what="zástupce, pokud klient jednal v zastoupení" />,
                }
          }
        />
      </Section>

      <Section title="4. Zda a kdy byl obchod proveden či odložen (§ 20)">
        <Fields
          rows={{
            "Provedení obchodu": <Execution postponed={report?.postponed} ts={tx.ts} />,
          }}
        />
      </Section>

      <Section title="5. Popis předmětu a podstatných okolností obchodu">
        <Fields
          rows={{
            "Datum a čas": csDateTime(tx.ts),
            "Částka a měna": `${tx.volume.toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} ${tx.currency}`,
            "Částka v CZK": `${czk(tx.amount)} (kurz ${tx.fxRate.toLocaleString("cs-CZ")})`,
            "Druh obchodu": cs(TX_TYPE, tx.type),
            "Účet plátce":
              tx.payerAccount && `${tx.payerAccount} (${tx.payerCountry ?? "stát neuveden"})`,
            "Účet příjemce":
              tx.payeeAccount && `${tx.payeeAccount} (${tx.payeeCountry ?? "stát neuveden"})`,
            "Důvod platby uvedený příkazcem": <Missing what="účel platby" />,
          }}
        />
        <h3 className="mt-2 text-[13px] font-bold">Čím je obchod podezřelý</h3>
        <p className="text-[13px] whitespace-pre-line">
          {report?.reason ?? <Missing what="odůvodnění oznámení" />}
        </p>
        {grounds.map((g) => (
          <Grounds
            key={`${g.hit.rule}-${g.hit.grainKey}`}
            facts={g}
            flagged={flagged.get(g.hit) ?? ""}
          />
        ))}
        <h3 className="mt-2 text-[13px] font-bold">
          Obchody klienta v okně, které pravidlo posuzovalo
        </h3>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={th}>Datum a čas</th>
              <th className={th}>Obchod</th>
              <th className={th}>Směr</th>
              <th className={th}>Účet protistrany</th>
              <th className={th}>Stát</th>
              <th className={`${th} text-right`}>Částka</th>
            </tr>
          </thead>
          <tbody>
            {flow.map((t) => (
              <tr key={t.id} className={t.id === tx.id ? "font-semibold" : undefined}>
                <td className={td}>{csDateTime(t.ts)}</td>
                <td className={`${td} font-mono`}>{t.id}</td>
                <td className={td}>{DIRECTION[t.direction]}</td>
                <td className={`${td} font-mono`}>{t.counterpartyAccount ?? "–"}</td>
                <td className={td}>{t.counterpartyCountry ?? "–"}</td>
                <td className={`${td} text-right whitespace-nowrap`}>{czk(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="6. Další údaje související s podezřelým obchodem">
        <Fields
          rows={{
            "Další účastníci obchodu":
              parties.length === 0 ? (
                "žádní"
              ) : (
                <ul>
                  {parties.map((t) => (
                    <li key={`${t.counterpartyAccount}-${t.direction}`}>
                      <span className="font-mono">{t.counterpartyAccount}</span> (
                      {t.counterpartyCountry ?? "stát neuveden"}),{" "}
                      {t.direction === "in" ? "plátce" : "příjemce"}:{" "}
                      <Missing what="jméno a adresa" />
                    </li>
                  ))}
                </ul>
              ),
            "Další výstrahy klienta":
              other.length === 0 ? (
                "žádné"
              ) : (
                <ul>
                  {other.map((o) => (
                    <li key={`${o.hit.rule}-${o.hit.grainKey}`}>
                      {o.hit.rule} „{o.hit.name}“ ({o.hit.grainKey})
                    </li>
                  ))}
                </ul>
              ),
          }}
        />
      </Section>

      <Section title="7. Osoba, která za povinnou osobu plní oznamovací povinnost (§ 18 odst. 6)">
        <Fields
          rows={{
            "Jméno a příjmení": report?.actor ?? <Missing what="kontaktní osoba" />,
            "Pracovní zařazení": CONTACT.position,
            Telefon: CONTACT.phone,
            "E-mail": CONTACT.email,
            "Místo, čas a datum podání": "Praha, ……………………………………",
            Podpis: "……………………………………",
          }}
        />
      </Section>
    </article>
  );
}
