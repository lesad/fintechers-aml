import { riskClasses, Tab, Tabs } from "@/components";
import { MOCK_QUEUE, openCountByRating, ReviewQueue } from "@/features/review-queue";
import { useTabs } from "@/hooks";
import { cn } from "@/utils";

import { Header } from "./Header";

export function App() {
  const tabs = useTabs();
  const byId = new Map(MOCK_QUEUE.map((r) => [r.id, r]));
  const openCases = MOCK_QUEUE.filter((r) => r.status !== "Closed").length;
  const active = tabs.active ? byId.get(tabs.active) : undefined;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        openByRating={openCountByRating(MOCK_QUEUE)}
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
                  className={cn("size-[7px] flex-none rounded-[2px]", riskClasses[item.rule].dot)}
                />
              )}
              <span className="font-mono text-xs">{id}</span>
            </Tab>
          );
        })}
      </Tabs>

      {active ? (
        // Placeholder until the transaction detail is built (next step).
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-auto text-fg-subtle">
          <span className="font-mono text-base font-semibold text-fg">{active.id}</span>
          <span className="text-xs">Transaction detail comes in the next step.</span>
        </main>
      ) : (
        <ReviewQueue items={MOCK_QUEUE} openIds={tabs.open} onOpen={tabs.openTab} />
      )}
    </div>
  );
}
