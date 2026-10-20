import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";

import { type RiskLevel, type SubTabItem, SubTabs, Tab, Tabs, Toast } from "@/components";
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
  useAutoAssess,
  useQueue,
} from "@/features/review-queue";
import { BacktestView, RulesPage, saveRule } from "@/features/rules";
import { TriageScoringPage } from "@/features/triage-scoring";
import { fetchUsers, saveUser, savedUser, type User } from "@/user";

import { Header } from "./Header";
import { TabLabel } from "./TabLabel";
import {
  backtestTab,
  parseBacktestTab,
  type SettingsSub,
  SETTINGS_TAB,
  settingsPath,
  useAppRoutes,
} from "./use-app-routes";
import { type ToastMessage, useBacktestProgress } from "./use-backtest-progress";
import { useRecalculation } from "./use-recalculation";

const NO_COUNTS: Record<RiskLevel, number> = { High: 0, Medium: 0, Low: 0 };

const SETTINGS_SECTIONS: SubTabItem<SettingsSub>[] = [
  { id: "rules", label: "Detection rules" },
  { id: "triage", label: "Triage scoring" },
];

/** `/rules` was the rules page before it became a section of the settings tab; the `?rule=<id>` link still works. */
function RulesRedirect() {
  const { search } = useLocation();
  return <Navigate to={`${settingsPath("rules")}${search}`} replace />;
}

export function App() {
  const { tabs, settings, importOpen, toggleImport } = useAppRoutes();
  // What a backtest tab says, e.g. "B2 v2" (one opened from a link says just "Backtest"), and how many backtests
  // were started from it, so an open tab loads a new one afresh.
  const [btLabels, setBtLabels] = useState<Record<string, string>>({});
  const [btStarts, setBtStarts] = useState<Record<string, number>>({});
  // The app's one toast: backtests and alert recalculations report through it, the latest message wins.
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const backtests = useBacktestProgress(tabs.active, setToast);
  const review = useDecisions();
  const [filter, setFilter] = useState<QueueFilter>(NO_FILTER);
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(savedUser);
  const role: Role = user?.role ?? "ANALYST";
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
    // The compliance manager oversees every case; the others work the cases assigned to them.
    assignee: role === "COMPLIANCE_MANAGER" ? undefined : user?.id,
    aiOnly: filter.aiOnly,
  });
  // An approved rule version recalculates the alerts in the background; the queue reloads once it is done.
  const recalculation = useRecalculation(setToast, queue.reload);
  const items = review.apply(useAutoAssess(queue.items, !queue.loading));
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
        onSettings={() => tabs.openTab(SETTINGS_TAB)}
        onHome={() => tabs.select(null)}
      />

      <Routes>
        <Route path="/" element={null} />
        <Route path="/transactions/:id" element={null} />
        <Route path="/settings/rules" element={null} />
        <Route path="/settings/triage" element={null} />
        <Route path="/rules" element={<RulesRedirect />} />
        <Route path="/backtests/:id" element={null} />
        <Route path="/import" element={<ImportPage onDataChanged={queue.reload} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* NOTE: the review area stays mounted behind the import page, so open tabs and half-written reasons survive. */}
      <div hidden={importOpen} className="flex min-h-0 flex-1 flex-col print:block">
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
              title={id === SETTINGS_TAB ? "Settings" : (btLabels[id] ?? id)}
            >
              <TabLabel
                id={id}
                level={rating.get(id)}
                backtest={btLabels[id]}
                progress={backtests.progress[id]}
              />
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
          <div
            key={id}
            hidden={tabs.active !== id}
            className="flex min-h-0 flex-1 flex-col print:block"
          >
            {tabContent(id)}
          </div>
        ))}
      </div>
      {toast && (
        <Toast
          key={toast.message}
          message={toast.message}
          link={toast.link}
          onDone={() => setToast(null)}
          duration={6000}
        />
      )}
    </div>
  );

  function tabContent(id: string) {
    if (id === SETTINGS_TAB)
      return (
        <>
          <SubTabs
            label="Settings sections"
            items={SETTINGS_SECTIONS}
            activeId={settings.sub}
            onSelect={settings.select}
          />
          {/* Both sections stay mounted, so a half-filled rule form survives a switch to the scoring and back. */}
          <div hidden={settings.sub !== "rules"} className="flex min-h-0 flex-1 flex-col">
            <RulesPage
              author={user?.name ?? ""}
              user={user}
              users={users}
              onApproved={(v) => recalculation.start(`${v.key} v${v.version}`)}
              onBacktest={(draft) => {
                const tab = backtestTab(draft.id);
                setBtLabels((l) => ({ ...l, [tab]: `${draft.key} v${draft.version}` }));
                setBtStarts((s) => ({ ...s, [tab]: (s[tab] ?? 0) + 1 }));
                tabs.openTab(tab);
              }}
            />
          </div>
          <div hidden={settings.sub !== "triage"} className="flex min-h-0 flex-1 flex-col">
            <TriageScoringPage author={user?.name ?? ""} />
          </div>
        </>
      );
    const bt = parseBacktestTab(id);
    if (bt)
      return (
        <BacktestView
          key={btStarts[id] ?? 0}
          draftId={bt.draftId}
          onOpen={tabs.openTab}
          onProgress={(progress, backtest) => backtests.report(id, progress, backtest)}
        />
      );
    return (
      <TransactionDetail
        id={id}
        decisions={review.decisions}
        role={role}
        users={users}
        onDecide={async (d) => {
          await setStatus(id, { ...d, status: STATUS_CODE[d.action] });
          review.decide(id, { ...d, by: user?.name ?? "" });
          // The case may have left this user's queue (escalated); the engine's list says.
          queue.reload();
        }}
        onAcceptSuggestion={async (rule, changeReason) =>
          (await saveRule({ ...rule, author: user?.name ?? "", changeReason })).id
        }
        onOpen={tabs.openTab}
      />
    );
  }
}
