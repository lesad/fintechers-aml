import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";

import { type RiskLevel, Tab, Tabs } from "@/components";
import { ImportPage } from "@/features/data-import";
import {
  fetchDetail,
  NO_FILTER,
  NotFoundError,
  type QueueFilter,
  ReviewQueue,
  type Role,
  CASE_STATUSES,
  STATUS_CODE,
  setStatus,
  statusParam,
  TransactionDetail,
  useDecisions,
  useQueue,
} from "@/features/review-queue";
import { BacktestView, RulesPage, saveRule } from "@/features/rules";
import { fetchUsers, saveUser, savedUser, type User } from "@/user";

import { Header } from "./Header";
import { TabLabel } from "./TabLabel";
import { backtestTab, parseBacktestTab, RULES_TAB, useAppRoutes } from "./use-app-routes";

const NO_COUNTS: Record<RiskLevel, number> = { High: 0, Medium: 0, Low: 0 };

export function App() {
  const { tabs, importOpen, toggleImport } = useAppRoutes();
  // What a backtest tab says, e.g. "B2 v2" (one opened from a link says just "Backtest"), and how many backtests
  // were started from it, so an open tab loads a new one afresh.
  const [btLabels, setBtLabels] = useState<Record<string, string>>({});
  const [btStarts, setBtStarts] = useState<Record<string, number>>({});
  const review = useDecisions();
  const [filter, setFilter] = useState<QueueFilter>(NO_FILTER);
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(savedUser);
  const role: Role = user?.role === "MANAGER" ? "Manager" : "Reviewer";
  const chooseUser = (next: User) => {
    // Saved before the state changes, so the queue reload it triggers already carries the new user.
    saveUser(next);
    setUser(next);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    fetchUsers(ctrl.signal)
      .then((list) => {
        setUsers(list);
        // The engine's copy wins (a renamed user); nobody picked yet → the first user.
        const chosen = list.find((u) => u.id === savedUser()?.id) ?? list[0];
        if (chosen) chooseUser(chosen);
      })
      // Without users the header shows none and a decision fails with the engine's reason.
      .catch(() => {});
    return () => ctrl.abort();
    // Loads the users once; `chooseUser` only wraps setters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const queue = useQueue({
    query: filter.query,
    rating: filter.rating,
    status: statusParam(filter.status),
    assignee: user?.id,
    aiOnly: filter.aiOnly,
  });
  const items = review.apply(queue.items);
  const rating = new Map(items.map((r) => [r.id, r.rule]));
  // The engine counts only the signed-in user's cases (X-User-Id).
  const openByRating = queue.countsByRating ?? NO_COUNTS;
  const openCases = openByRating.High + openByRating.Medium + openByRating.Low;

  return (
    <div className="flex h-dvh flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
      <Header
        openByRating={queue.countsByRating}
        user={user}
        users={users}
        onUser={chooseUser}
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
        importOpen={importOpen}
        onToggleImport={toggleImport}
        rulesActive={tabs.active === RULES_TAB}
        onRules={() => tabs.openTab(RULES_TAB)}
        onHome={() => tabs.select(null)}
      />

      <Routes>
        <Route path="/" element={null} />
        <Route path="/transactions/:id" element={null} />
        <Route path="/rules" element={null} />
        <Route path="/backtests/:id" element={null} />
        <Route path="/import" element={<ImportPage onDataChanged={queue.reload} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* NOTE: the review area stays mounted behind the import page, so open tabs and half-written reasons survive. */}
      <div hidden={importOpen} className="flex min-h-0 flex-1 flex-col">
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
          {tabs.open.map((id) => (
            <Tab
              key={id}
              active={tabs.active === id}
              onSelect={() => tabs.select(id)}
              onClose={() => tabs.closeTab(id)}
              title={id === RULES_TAB ? "Rules" : (btLabels[id] ?? id)}
            >
              <TabLabel id={id} level={rating.get(id)} backtest={btLabels[id]} />
            </Tab>
          ))}
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
            statuses={CASE_STATUSES}
            openIds={tabs.open}
            onOpen={tabs.openTab}
          />
        )}
        {/* Open tabs stay mounted while hidden, so a half-written reason, a form and the scroll position survive a tab switch. */}
        {tabs.open.map((id) => (
          <div key={id} hidden={tabs.active !== id} className="flex min-h-0 flex-1 flex-col">
            {tabContent(id)}
          </div>
        ))}
      </div>
    </div>
  );

  function tabContent(id: string) {
    if (id === RULES_TAB)
      return (
        <RulesPage
          author={user?.name ?? ""}
          manager={user?.role === "MANAGER"}
          onBacktest={(draft) => {
            const tab = backtestTab(draft.id);
            setBtLabels((l) => ({ ...l, [tab]: `${draft.key} v${draft.version}` }));
            setBtStarts((s) => ({ ...s, [tab]: (s[tab] ?? 0) + 1 }));
            tabs.openTab(tab);
          }}
        />
      );
    const bt = parseBacktestTab(id);
    if (bt)
      return <BacktestView key={btStarts[id] ?? 0} draftId={bt.draftId} onOpen={tabs.openTab} />;
    return (
      <TransactionDetail
        id={id}
        decisions={review.decisions}
        role={role}
        users={users}
        onDecide={async (d) => {
          await setStatus(id, STATUS_CODE[d.action], d.reason);
          review.decide(id, { ...d, by: user?.name ?? "" });
          // The case may have left this user's queue (escalated); the engine's list says.
          queue.reload();
        }}
        onAcceptSuggestion={async (rule) =>
          (await saveRule({ ...rule, author: user?.name ?? "" })).id
        }
        onOpen={tabs.openTab}
      />
    );
  }
}
