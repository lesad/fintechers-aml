import { useState } from "react";

import { type RiskLevel, riskDot, Tab, Tabs } from "@/components";
import {
  fetchDetail,
  NO_FILTER,
  NotFoundError,
  type QueueFilter,
  ReviewQueue,
  TransactionDetail,
  useDecisions,
  useQueue,
} from "@/features/review-queue";
import { useTabs } from "@/hooks";
import { cn } from "@/utils";

import { Header } from "./Header";

const NO_COUNTS: Record<RiskLevel, number> = { High: 0, Medium: 0, Low: 0 };

export function App() {
  const tabs = useTabs();
  const review = useDecisions();
  const [filter, setFilter] = useState<QueueFilter>(NO_FILTER);
  const queue = useQueue(filter.query, filter.rating);
  const items = review.apply(queue.items);
  const rating = new Map(items.map((r) => [r.id, r.rule]));
  const openByRating = review.openCounts(queue.countsByRating ?? NO_COUNTS);
  const openCases = openByRating.High + openByRating.Medium + openByRating.Low;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        openByRating={openByRating}
        onJump={async (id) => {
          try {
            await fetchDetail(id);
          } catch (err) {
            // Any other failure still opens the tab, which shows the error and a retry.
            if (err instanceof NotFoundError) return false;
          }
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
            {openCases.toLocaleString("en-US")}
          </span>
        </Tab>
        {tabs.open.map((id) => {
          const level = rating.get(id);
          return (
            <Tab
              key={id}
              active={tabs.active === id}
              onSelect={() => tabs.select(id)}
              onClose={() => tabs.closeTab(id)}
              title={id}
            >
              {level && (
                <span className={cn("size-[7px] flex-none rounded-[2px]", riskDot({ level }))} />
              )}
              <span className="font-mono text-xs">{id}</span>
            </Tab>
          );
        })}
      </Tabs>

      {tabs.active === null && (
        <ReviewQueue
          items={items}
          total={queue.total}
          loading={queue.loading}
          done={queue.done}
          error={queue.error}
          onLoadMore={queue.loadMore}
          onRetry={queue.retry}
          filter={filter}
          onFilter={setFilter}
          openIds={tabs.open}
          onOpen={tabs.openTab}
        />
      )}
      {/* Open details stay mounted while hidden, so a half-written reason and the scroll position survive a tab switch. */}
      {tabs.open.map((id) => (
        <div key={id} hidden={tabs.active !== id} className="flex min-h-0 flex-1 flex-col">
          <TransactionDetail
            id={id}
            decisions={review.decisions}
            onDecide={(action, reason, level) =>
              review.decide(id, { action, reason, rating: level })
            }
            onUndo={() => review.undo(id)}
            onOpen={tabs.openTab}
          />
        </div>
      ))}
    </div>
  );
}
