import { useState } from "react";

import { AiLabel, Card, Toast } from "@/components";

import { AiNotConnected } from "./AiNotConnected";
import { fetchSuggestion } from "./api";
import { caseState } from "./case-state";
import { ClientCard } from "./ClientCard";
import { ClientHistoryCard } from "./ClientHistoryCard";
import { DecisionPanel } from "./DecisionPanel";
import { DetailStrip } from "./DetailStrip";
import { MoneyFlow } from "./MoneyFlow";
import { RuleRatingCard } from "./RuleRatingCard";
import { SuggestionModal } from "./SuggestionModal";
import { useDetail } from "./use-detail";

import type { TransactionDetail as Detail, Suggestion } from "./api";
import type { Decision } from "./decisions";
import type { Role } from "./queue";

type TransactionDetailProps = {
  id: string;
  decisions: Record<string, Decision>;
  role: Role;
  /** Saves the status on the engine, then records the decision. */
  onDecide: (d: Pick<Decision, "action" | "reason">) => Promise<void>;
  onOpen: (id: string, background: boolean) => void;
};

/** Loads one transaction from the engine and shows it; a decision saves the case status on the engine. */
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
  role,
  onDecide,
  onOpen,
}: Omit<TransactionDetailProps, "id"> & { detail: Detail }) {
  const { transaction: tx, client, rating } = detail;
  const decision = decisions[tx.id];
  const state = caseState(detail, decision);
  // A false positive asks for a rule change on the alert; a transaction with several alerts uses the first.
  const alertId = detail.alerts[0]?.id;
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // A false positive first asks for a rule change, then records the decision (and with it the alert status) whatever
  // the answer: a suggestion opens the modal, no suggestion or a failure only confirms the decision.
  const markFalsePositive = async (reason: string) => {
    const result =
      alertId === undefined ? null : await fetchSuggestion(alertId, reason).catch(() => undefined);
    await onDecide({ action: "False Positive", reason });
    if (result?.kind === "rule_version") setSuggestion(result);
    else if (result === undefined)
      setToast("Marked as false positive. The rule suggestion failed.");
    else setToast("Marked as false positive.");
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DetailStrip
        detail={detail}
        status={state.status}
        flagged={state.flaggedAt}
        triage={state.triage}
      />

      <div className="min-h-0 flex-1 overflow-auto bg-bg-sub">
        <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-3 px-4 pt-3 pb-4">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
              <RuleRatingCard
                rating={rating}
                ruleNames={state.ruleNames}
                thresholds={state.thresholds}
                alertTypes={state.alertTypes}
              />

              <Card tone="ai" title={<AiLabel>Rating</AiLabel>} className="gap-2">
                <AiNotConnected />
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

            {state.current && (
              <ClientHistoryCard
                key={tx.id}
                current={state.current}
                count={detail.historyCount}
                decisions={decisions}
                onOpen={onOpen}
              />
            )}
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
                saved={state.saved}
                role={role}
                onDecide={(action, reason) =>
                  action === "False Positive"
                    ? markFalsePositive(reason)
                    : onDecide({ action, reason })
                }
              />
            )}
          </div>
        </div>
      </div>
      {suggestion && (
        <SuggestionModal suggestion={suggestion} onClose={() => setSuggestion(null)} />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </main>
  );
}
