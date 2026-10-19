import { MOCK_QUEUE } from "./mock";

import type { QueueItem } from "./queue";
import type { RiskLevel } from "@/components";

// Mock detail data from docs/design/aml-review-queue until the engine serves it.
// Synthetic, not from the ČNB data.

export type Direction = "Incoming" | "Outgoing" | "Remittance";

export type TxDetail = {
  dir: Direction;
  /** Original currency and amount when not CZK. */
  original: { currency: string; amount: number } | null;
  /** Counterparty account and its country (ISO 2). */
  counterparty: string;
  country: string;
  ruleName: string;
  limit: string;
  actual: string;
  aiText: string;
};

export type Client = {
  country: string;
  type: "Legal entity" | "Natural person" | "Entrepreneur";
  contract: string;
  channel: "In person" | "Distant";
  pep: boolean;
  risk: RiskLevel;
  /** Expected CZK per month at contract signing. */
  expectedMonthly: number;
  /** Real CZK volume in Q2 2026; null when the client had no Q2 history. */
  q2: number | null;
};

export type HistoryTx = {
  id: string;
  /** `YYYY-MM-DD HH:mm` */
  dt: string;
  dir: Direction;
  counterparty: string;
  country: string;
  amount: number;
};

export const COUNTRIES: Record<string, string> = {
  CZ: "Czechia",
  AT: "Austria",
  DE: "Germany",
  CY: "Cyprus",
  LV: "Latvia",
  SK: "Slovakia",
  GB: "United Kingdom",
  ES: "Spain",
};

type TxRow = [
  dir: Direction,
  currency: string | null,
  amount: number | null,
  counterparty: string,
  country: string,
  ruleName: string,
  limit: string,
  actual: string,
  aiText: string,
];

const tx = ([
  dir,
  currency,
  amount,
  counterparty,
  country,
  ruleName,
  limit,
  actual,
  aiText,
]: TxRow): TxDetail => ({
  dir,
  original: currency && amount !== null ? { currency, amount } : null,
  counterparty,
  country,
  ruleName,
  limit,
  actual,
  aiText,
});

export const TX_DETAILS: Record<string, TxDetail> = {
  TX000004812: tx([
    "Incoming",
    null,
    null,
    "CASH-BR0214",
    "CZ",
    "Split cash deposits",
    "max 3 deposits under 250,000 CZK / 48 h",
    "6 deposits / 48 h",
    "Six cash deposits within 48 hours, each just under the reporting threshold. The depositing branch is new for this client. The pattern is consistent with structuring.",
  ]),
  TX000123456: tx([
    "Outgoing",
    "EUR",
    7352,
    "AAT00116",
    "AT",
    "PEP outgoing payment",
    "100,000 CZK",
    "184,500 CZK",
    "Payee appears monthly in the client's history with similar amounts; likely a regular supplier payment. The 2 previous payments to AAT00116 were 178,200 and 186,900 CZK. The client's PEP status alone triggers the rule.",
  ]),
  TX000004901: tx([
    "Outgoing",
    null,
    null,
    "ACY00877",
    "CY",
    "Sanctions name screening",
    "match score 0.75",
    "match score 0.82",
    "",
  ]),
  TX000004790: tx([
    "Outgoing",
    "EUR",
    127490,
    "ALV00342",
    "LV",
    "Rapid pass-through",
    "forwarded after 60 min or later",
    "forwarded after 15 min",
    "Funds of the same amount arrived 15 minutes earlier and left in full. The payee account also appears behind 3 related accounts. Typical behaviour of a pass-through account.",
  ]),
  TX000004822: tx([
    "Incoming",
    "EUR",
    22310,
    "ADE00921",
    "DE",
    "Deviation from client average",
    "3× 12-month avg (420,000 CZK)",
    "4× (560,000 CZK)",
    "Payer ADE00921 is a known counterparty of this client. A similar spike occurred in October 2024 and 2025. Seasonal billing is a plausible explanation.",
  ]),
  TX000004870: tx([
    "Incoming",
    null,
    null,
    "ACZ00455",
    "CZ",
    "Unlinked third-party payer",
    "payer on account mandate",
    "payer not on mandate",
    "The payer account belongs to the registered spouse of the account holder. Earlier payments from it were small and regular. Little indication of third-party funding.",
  ]),
  TX000004888: tx([
    "Outgoing",
    null,
    null,
    "ACZ00610",
    "CZ",
    "Round-amount series",
    "max 3 round transfers / day",
    "5 round transfers / day",
    "Five round-amount transfers to 5 different, previously unseen recipients. No payment references were given. The purpose cannot be inferred from the data.",
  ]),
  TX000004760: tx([
    "Remittance",
    "EUR",
    35460,
    "ASK00203",
    "SK",
    "Early large inflow",
    "500,000 CZK in first 30 days",
    "890,000 CZK on day 6",
    "The amount is consistent with the property sale declared at onboarding. The direction could not be confirmed from the payment message. Supporting documents would settle it.",
  ]),
  TX000004843: tx([
    "Outgoing",
    "GBP",
    1548,
    "AGB00064",
    "GB",
    "First payment to country",
    "country seen in client history",
    "United Kingdom, first time",
    "The payee account receives tuition payments from other clients too. The amount matches a term fee. Low risk.",
  ]),
  TX000004897: tx([
    "Incoming",
    null,
    null,
    "ACZ00731",
    "CZ",
    "Recent change of beneficial owner",
    "no UBO change in 30 days",
    "UBO changed 12 days ago",
    "The ownership change was filed in the public register before this payment. The payer is a long-standing counterparty. No unusual pattern.",
  ]),
  TX000004879: tx([
    "Outgoing",
    null,
    null,
    "ACZ00102",
    "CZ",
    "Dormant account activity",
    "activity within 12 months",
    "inactive for 19 months",
    "The account was reactivated in person at a branch. The payment is a small utility bill. Low risk.",
  ]),
  TX000004801: tx([
    "Outgoing",
    "EUR",
    718,
    "ATM-ES0091",
    "ES",
    "Unusual ATM location",
    "home region (CZ)",
    "Spain",
    "The withdrawal location matches a travel notice filed for the card. The amount is in the usual range. Low risk.",
  ]),
};

type ClientRow = [
  country: string,
  type: Client["type"],
  contract: string,
  channel: Client["channel"],
  pep: boolean,
  risk: RiskLevel,
  expectedMonthly: number,
  q2: number | null,
];

const client = ([
  country,
  type,
  contract,
  channel,
  pep,
  risk,
  expectedMonthly,
  q2,
]: ClientRow): Client => ({ country, type, contract, channel, pep, risk, expectedMonthly, q2 });

export const CLIENTS: Record<string, Client> = {
  K003797: client(["CZ", "Legal entity", "2019-03-14", "In person", true, "High", 400000, 1620000]),
  K002118: client([
    "CZ",
    "Natural person",
    "2021-11-02",
    "Distant",
    false,
    "Medium",
    60000,
    171000,
  ]),
  K007731: client(["CZ", "Legal entity", "2025-08-19", "Distant", false, "High", 1500000, 9850000]),
  K015009: client(["CZ", "Natural person", "2023-05-30", "In person", false, "Low", 50000, 162000]),
  K004256: client([
    "CZ",
    "Entrepreneur",
    "2020-01-08",
    "In person",
    false,
    "Medium",
    800000,
    2610000,
  ]),
  K009980: client(["SK", "Legal entity", "2026-10-08", "Distant", false, "Medium", 300000, null]),
  K011274: client(["CZ", "Natural person", "2018-09-12", "In person", false, "Low", 40000, 118000]),
  K006613: client([
    "CZ",
    "Legal entity",
    "2017-04-21",
    "In person",
    false,
    "Low",
    2000000,
    5640000,
  ]),
  K013350: client(["CZ", "Natural person", "2015-06-03", "In person", false, "Low", 20000, 0]),
};

/** Earlier alerts on transactions that are no longer in the queue. */
export const PAST_FLAGS: Record<string, { rule: RiskLevel; note: string }> = {
  TX000003970: { rule: "High", note: "Regular supplier payment, invoice verified" },
  TX000003311: { rule: "High", note: "Regular supplier payment, contract on file" },
  TX000004402: { rule: "Low", note: "Known Slovak customer" },
};

type Row = [string, string, Direction, string, string, number];

const HAND_HISTORY: Record<string, Row[]> = {
  K003797: [
    ["TX000123456", "2026-10-17 15:58", "Outgoing", "AAT00116", "AT", 184500],
    ["TX000006114", "2026-10-17 11:20", "Incoming", "ADE00921", "DE", 96000],
    ["TX000006102", "2026-10-17 09:05", "Outgoing", "ACZ00230", "CZ", 22400],
    ["TX000004822", "2026-10-16 14:31", "Incoming", "ADE00921", "DE", 560000],
    ["TX000004818", "2026-10-16 12:40", "Incoming", "CASH-BR0214", "CZ", 231700],
    ["TX000004812", "2026-10-16 09:12", "Incoming", "CASH-BR0214", "CZ", 248900],
    ["TX000004795", "2026-10-15 16:20", "Incoming", "CASH-BR0214", "CZ", 239000],
    ["TX000004781", "2026-10-15 11:05", "Incoming", "CASH-BR0214", "CZ", 245500],
    ["TX000004402", "2026-10-08 13:02", "Incoming", "ASK00517", "SK", 142000],
    ["TX000003970", "2026-09-16 15:40", "Outgoing", "AAT00116", "AT", 178200],
    ["TX000003311", "2026-08-18 16:05", "Outgoing", "AAT00116", "AT", 186900],
  ],
};

/** Other transactions the same day, for days where the design shows a specific flow. */
const SAME_DAY: Record<string, [string, Direction, string, string, number][]> = {
  TX000004790: [["10:48", "Incoming", "ACZ00788", "CZ", 3200000]],
  TX000004888: [
    ["09:14", "Outgoing", "ACZ00611", "CZ", 200000],
    ["11:02", "Outgoing", "ACZ00612", "CZ", 300000],
    ["13:45", "Outgoing", "ACZ00613", "CZ", 100000],
    ["15:30", "Outgoing", "ACZ00614", "CZ", 250000],
  ],
};

const pad = (n: number) => String(n).padStart(2, "0");
const formatDt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const toTx = ([id, dt, dir, counterparty, country, amount]: Row): HistoryTx => ({
  id,
  dt,
  dir,
  counterparty,
  country,
  amount,
});

const cache = new Map<string, HistoryTx[]>();

/**
 * The client's recent transactions, newest first: hand-written for K003797, otherwise
 * generated deterministically from the client id around the client's queue items.
 */
export function clientHistory(clientId: string): HistoryTx[] {
  const cached = cache.get(clientId);
  if (cached) return cached;

  const hand = HAND_HISTORY[clientId];
  const out = hand ? hand.map(toTx) : generatedHistory(clientId);
  out.sort((a, b) => (a.dt < b.dt ? 1 : -1));
  cache.set(clientId, out);
  return out;
}

/** A seeded random source per client, so the generated history is the same every time. */
function generator(clientId: string) {
  let seed = [...clientId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const expected = CLIENTS[clientId]?.expectedMonthly ?? 100000;
  const pool = ["ACZ00118", "ACZ00342", "ACZ00509", "ACZ00671", "ACZ00825", "ACZ00903"];
  const id = () => `TX00000${1000 + Math.floor(rnd() * 8999)}`;
  return {
    rnd,
    id,
    /** A random domestic transaction at `at`; `inShare` = chance it is incoming. */
    tx: (at: Date, inShare: number): HistoryTx => ({
      id: id(),
      dt: formatDt(at),
      dir: rnd() < inShare ? "Incoming" : "Outgoing",
      counterparty: pool[Math.floor(rnd() * pool.length)] ?? "ACZ00118",
      country: "CZ",
      amount: Math.round(((expected / 10) * (0.2 + rnd() * 1.4)) / 100) * 100,
    }),
  };
}

/** The design's fixed same-day transactions, or one random one earlier that business day. */
function sameDay(r: QueueItem, g: ReturnType<typeof generator>): HistoryTx[] {
  const day = r.date.slice(0, 10);
  const fixed = SAME_DAY[r.id];
  if (fixed) {
    return fixed.map(([time, dir, counterparty, country, amount]) => ({
      id: g.id(),
      dt: `${day} ${time}`,
      dir,
      counterparty,
      country,
      amount,
    }));
  }
  const base = new Date(r.date.replace(" ", "T"));
  const room = (base.getHours() - 7) * 60 + base.getMinutes();
  if (room <= 40) return [];
  const at = new Date(base.getTime() - (20 + Math.floor(g.rnd() * (room - 20))) * 60_000);
  return [g.tx(at, 0.5)];
}

function generatedHistory(clientId: string): HistoryTx[] {
  const g = generator(clientId);
  const queued = MOCK_QUEUE.filter((q) => q.client === clientId);
  const out: HistoryTx[] = queued.flatMap((r) => {
    const d = TX_DETAILS[r.id];
    const own: HistoryTx[] = d
      ? [
          {
            id: r.id,
            dt: r.date,
            dir: d.dir,
            counterparty: d.counterparty,
            country: d.country,
            amount: r.amount,
          },
        ]
      : [];
    return [...own, ...sameDay(r, g)];
  });
  // Five older transactions, a few days apart, before the earliest queue item.
  let t = new Date(Math.min(...queued.map((r) => new Date(r.date.replace(" ", "T")).getTime())));
  for (let i = 0; i < 5; i++) {
    t = new Date(t.getTime() - (2 + Math.floor(g.rnd() * 8)) * 86_400_000);
    t.setHours(8 + Math.floor(g.rnd() * 9), Math.floor(g.rnd() * 60));
    out.push(g.tx(t, 0.55));
  }
  return out;
}
