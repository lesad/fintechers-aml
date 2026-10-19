import { cva } from "class-variance-authority";

/** One of the day's transactions, as the flow draws it. */
export type FlowTx = {
  id: string;
  /** `YYYY-MM-DD HH:mm` */
  dt: string;
  dir: "Incoming" | "Outgoing" | "Remittance";
  counterparty: string;
  country: string;
  /** CZK */
  amount: number;
};

// `current` = the transaction the detail is about; it stays yellow even when it is a remittance.
const ribbonFill = cva("fill-flow", {
  variants: { current: { true: "" }, remittance: { true: "" } },
  compoundVariants: [
    { current: true, className: "fill-yellow" },
    { current: false, remittance: true, className: "fill-flow-remit" },
  ],
});
const endMark = cva("", {
  variants: { current: { true: "fill-flow-mark", false: "fill-fg-subtle" } },
});
const accountLabel = cva("fill-fg font-mono text-xs", {
  variants: { current: { true: "font-bold", false: "font-medium" } },
});
const amountLabel = cva("text-[11px]", {
  variants: { current: { true: "fill-fg font-semibold", false: "fill-fg-muted" } },
});

// ~280 px for labels left of the payers and ~240 px right of the payees (a remittance's line
// adds "· remittance").
const W = 880;
const X_LEFT = 290;
const ACC_LEFT = 410;
const ACC_RIGHT = 510;
const X_RIGHT = 630;
const GAP = 10;
/** Height in px of the larger side's total; line width = amount. */
const SCALE = 96;

const sum = (a: FlowTx[]) => a.reduce((x, t) => x + t.amount, 0);

type Point = [x: number, y: number];

/** A filled ribbon from the top edge at `from` to the top edge at `to`, `t` px thick. */
const ribbon = ([x1, a0]: Point, [x2, b0]: Point, t: number) => {
  const xm = (x1 + x2) / 2;
  return `M${x1} ${a0} C${xm} ${a0} ${xm} ${b0} ${x2} ${b0} L${x2} ${b0 + t} C${xm} ${b0 + t} ${xm} ${a0 + t} ${x1} ${a0 + t} Z`;
};

/**
 * One day of the client's money: payers on the left flow into the client's account,
 * payees on the right flow out. The current transaction is yellow; remittances count as
 * outgoing and get their own colour.
 */
export function MoneyFlow({
  day,
  currentId,
  clientId,
}: {
  day: FlowTx[];
  currentId: string;
  clientId: string;
}) {
  const ins = day.filter((t) => t.dir === "Incoming");
  const outs = day.filter((t) => t.dir !== "Incoming");
  const k = SCALE / Math.max(sum(ins), sum(outs), 1);
  const thick = (t: FlowTx) => Math.max(3, t.amount * k);
  const slot = (t: FlowTx) => Math.max(thick(t), 30);
  const colHeight = (a: FlowTx[]) =>
    a.length ? a.reduce((x, t) => x + slot(t), 0) + GAP * (a.length - 1) : 30;
  const inTotal = ins.reduce((x, t) => x + thick(t), 0);
  const outTotal = outs.reduce((x, t) => x + thick(t), 0);
  const accHeight = Math.max(Math.max(inTotal, outTotal) + 20, 56);
  const H = Math.max(colHeight(ins), colHeight(outs), accHeight) + 16;
  const accTop = (H - accHeight) / 2;

  const side = (arr: FlowTx[], left: boolean) => {
    let y = (H - colHeight(arr)) / 2;
    let b = accTop + (accHeight - (left ? inTotal : outTotal)) / 2;
    const textX = left ? X_LEFT - 10 : X_RIGHT + 10;
    const anchor = left ? "end" : "start";
    if (!arr.length) {
      return (
        <text x={textX} y={H / 2 + 4} textAnchor={anchor} className="fill-fg-subtle text-xs italic">
          {left ? "No incoming that day" : "No outgoing that day"}
        </text>
      );
    }
    return arr.map((t) => {
      const s = slot(t);
      const mid = y + s / 2;
      const w = thick(t);
      const a0 = mid - w / 2;
      const current = t.id === currentId;
      const path = left
        ? ribbon([X_LEFT, a0], [ACC_LEFT, b], w)
        : ribbon([ACC_RIGHT, b], [X_RIGHT, a0], w);
      y += s + GAP;
      b += w;
      return (
        <g key={t.id}>
          <path d={path} className={ribbonFill({ current, remittance: t.dir === "Remittance" })} />
          <rect
            x={left ? X_LEFT - 4 : X_RIGHT}
            y={a0}
            width={4}
            height={w}
            className={endMark({ current })}
          />
          <text x={textX} y={mid - 3} textAnchor={anchor} className={accountLabel({ current })}>
            {t.counterparty} · {t.country}
          </text>
          <text x={textX} y={mid + 12} textAnchor={anchor} className={amountLabel({ current })}>
            {Math.round(t.amount).toLocaleString("en-US")} CZK · {t.dt.slice(11)}
            {t.dir === "Remittance" ? " · remittance" : ""}
          </text>
        </g>
      );
    });
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      role="img"
      aria-label={`Money flow of ${clientId} on ${day[0]?.dt.slice(0, 10) ?? "this day"}`}
      className="block h-auto max-w-full"
    >
      {side(ins, true)}
      {side(outs, false)}
      <rect
        x={ACC_LEFT}
        y={accTop}
        width={ACC_RIGHT - ACC_LEFT}
        height={accHeight}
        rx={4}
        className="fill-fg"
      />
      <text
        x={(ACC_LEFT + ACC_RIGHT) / 2}
        y={H / 2 - 2}
        textAnchor="middle"
        className="fill-bg font-mono text-xs font-bold"
      >
        {clientId}
      </text>
      <text
        x={(ACC_LEFT + ACC_RIGHT) / 2}
        y={H / 2 + 12}
        textAnchor="middle"
        className="fill-bg text-[10px] opacity-75"
      >
        client&apos;s account
      </text>
    </svg>
  );
}
