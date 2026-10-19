import { riskDot, Tab, Tabs } from "@/components";
import {
  MOCK_QUEUE,
  openCountByRating,
  ReviewQueue,
  TransactionDetail,
  useDecisions,
} from "@/features/review-queue";
import { useTabs } from "@/hooks";
import { cn } from "@/utils";

import { Header } from "./Header";

export function App() {
  const tabs = useTabs();
  const review = useDecisions();
  const queue = review.apply(MOCK_QUEUE);
  const byId = new Map(queue.map((r) => [r.id, r]));
  const openCases = queue.filter((r) => r.status !== "Closed").length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        openByRating={openCountByRating(queue)}
        onJump={(id) => {
          if (!byId.has(id)) return false;
          tabs.openTab(id);
          return true;
        }}
      />

      <Tabs>
        <Tab
          active={tabs.active === null}
          onSelect={() => tabs.select(null)}
          className="font-semibold"
        >
          <span className="text-[11px] text-fg-subtle">☰</span>
          <span>Review queue</span>
          <span className="rounded-full bg-border-soft px-1.5 text-[11px] font-semibold text-fg-muted tabular-nums">
            {openCases}
          </span>
        </Tab>
        {tabs.open.map((id) => {
          const item = byId.get(id);
          return (
            <Tab
              key={id}
              active={tabs.active === id}
              onSelect={() => tabs.select(id)}
              onClose={() => tabs.closeTab(id)}
              title={item ? `${id} · ${item.client}` : id}
            >
              {item && (
                <span
                  className={cn(
                    "size-[7px] flex-none rounded-[2px]",
                    riskDot({ level: item.rule }),
                  )}
                />
              )}
              <span className="font-mono text-xs">{id}</span>
            </Tab>
          );
        })}
      </Tabs>

      {tabs.active === null && (
        <ReviewQueue items={queue} openIds={tabs.open} onOpen={tabs.openTab} />
      )}
      {/* Open details stay mounted while hidden, so a half-written reason and the scroll position survive a tab switch. */}
      {tabs.open.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <div key={id} hidden={tabs.active !== id} className="flex min-h-0 flex-1 flex-col">
            <TransactionDetail
              item={item}
              queue={queue}
              decisions={review.decisions}
              onDecide={(action, reason) => review.decide(id, action, reason)}
              onUndo={() => review.undo(id)}
              onOpen={tabs.openTab}
            />
          </div>
        );
      })}
    </div>
  );
}
