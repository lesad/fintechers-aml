import { AiPill, Card } from "@/components";

import { caseState } from "./case-state";
import { ClientCard } from "./ClientCard";
import { ClientHistoryCard } from "./ClientHistoryCard";
import { DecisionPanel } from "./DecisionPanel";
import { DetailStrip } from "./DetailStrip";
import { MoneyFlow } from "./MoneyFlow";
import { RuleRatingCard } from "./RuleRatingCard";
import { useDetail } from "./use-detail";

import type { TransactionDetail as Detail } from "./api";
import type { Decision } from "./decisions";

type TransactionDetailProps = {
  id: string;
  decisions: Record<string, Decision>;
  onDecide: (action: Decision["action"], reason: string, rating: Detail["rating"]) => void;
  onUndo: () => void;
  onOpen: (id: string, background: boolean) => void;
};

/** Loads one transaction from the engine and shows it; the decision stays in the browser. */
export function TransactionDetail({ id, ...rest }: TransactionDetailProps) {
  const detail = useDetail(id);
  if (detail.status === "ready") return <DetailView detail={detail.data} {...rest} />;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 text-fg-subtle">
      {detail.status === "loading" && (
        <>
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-border border-t-purple"
          />
          <span role="status">Loading {id}…</span>
        </>
      )}
      {detail.status === "not-found" && <span>Transaction {id} was not found.</span>}
      {detail.status === "error" && (
        <>
          <span className="text-high">
            Could not load {id}: {detail.message}
          </span>
          <button
            type="button"
            onClick={detail.retry}
            className="cursor-pointer border-0 bg-transparent p-0 text-xs text-fg-muted underline hover:text-purple"
          >
            Retry
          </button>
        </>
      )}
    </main>
  );
}

function DetailView({
  detail,
  decisions,
  onDecide,
  onUndo,
  onOpen,
}: Omit<TransactionDetailProps, "id"> & { detail: Detail }) {
  const { transaction: tx, client, rating } = detail;
  const decision = decisions[tx.id];
  const state = caseState(detail, decision);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DetailStrip detail={detail} status={state.status} flagged={state.flaggedAt} />

      <div className="min-h-0 flex-1 overflow-auto bg-bg-sub">
        <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-3 px-4 pt-3 pb-4">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
              <RuleRatingCard
                rating={rating}
                ruleNames={state.ruleNames}
                facts={state.facts}
                alertTypes={state.alertTypes}
                triage={state.triage}
              />

              <Card tone="ai" title="AI rating" className="gap-2">
                <div className="flex items-center gap-2">
                  <AiPill rating="none" />
                </div>
                <p className="m-0 text-[13px] leading-normal text-fg-muted">
                  No model rates cases (ADR-0032). An AI summary for the reviewer will appear here.
                </p>
              </Card>
            </div>

            <Card
              title="Money flow"
              className="gap-2"
              aside={
                <>
                  <span className="text-[11px] text-fg-subtle">{state.dayLabel}</span>
                  <span className="ml-auto flex items-center gap-3 text-[11px] text-fg-subtle">
                    <span className="flex items-center gap-[5px]">
                      <span className="h-1.5 w-3.5 rounded-[1px] bg-yellow" />
                      This transaction
                    </span>
                    <span className="flex items-center gap-[5px]">
                      <span className="h-1.5 w-3.5 rounded-[1px] bg-flow" />
                      Other that day
                    </span>
                    <span className="flex items-center gap-[5px]">
                      <span className="h-1.5 w-3.5 rounded-[1px] bg-flow-remit" />
                      Remittance
                    </span>
                    <span>Line width = amount</span>
                  </span>
                </>
              }
            >
              <div className="flex justify-center">
                <MoneyFlow day={state.dayTx} currentId={tx.id} clientId={client.id} />
              </div>
            </Card>

            <ClientHistoryCard
              history={detail.history}
              currentId={tx.id}
              decisions={decisions}
              onOpen={onOpen}
            />
          </div>

          <div className="sticky top-3 flex flex-col gap-3">
            <ClientCard client={client} />
            {state.decides === "triage" && !decision && (
              <Card raised title="Decision">
                <span className="text-[13px] text-fg-muted">
                  Closed by triage without a reviewer: the score stayed low and only rules on the
                  auto-close list fired.
                </span>
              </Card>
            )}
            {rating && state.decides === "reviewer" && (
              <DecisionPanel
                decision={decision}
                onDecide={(action, reason) => onDecide(action, reason, rating)}
                onUndo={onUndo}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
