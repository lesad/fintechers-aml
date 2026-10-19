import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useMatch, useNavigate } from "react-router";

import { type RiskLevel, riskDot, Tab, Tabs } from "@/components";
import {
  fetchDetail,
  NO_FILTER,
  NotFoundError,
  type QueueFilter,
  ReviewQueue,
  type Role,
  ROLE_STATUSES,
  STATUS_CODE,
  setStatus,
  statusParam,
  TransactionDetail,
  useDecisions,
  useQueue,
} from "@/features/review-queue";
import { RulesPage } from "@/features/rules";
import { useTabs } from "@/hooks";
import { fetchUsers, saveUser, savedUser, type User } from "@/user";
import { cn } from "@/utils";

import { Header } from "./Header";

const NO_COUNTS: Record<RiskLevel, number> = { High: 0, Medium: 0, Low: 0 };

export function App() {
  const tabs = useTabs();
  const review = useDecisions();
  const [filter, setFilter] = useState<QueueFilter>(NO_FILTER);
  // Routes: `/` is the review overview, `/rules` the rules page; anything else goes back to `/`.
  const navigate = useNavigate();
  const rulesOpen = useMatch("/rules") !== null;
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
  const queue = useQueue(filter.query, filter.rating, statusParam(role, filter.status));
  const items = review.apply(queue.items);
  const rating = new Map(items.map((r) => [r.id, r.rule]));
  const openByRating = review.openCounts(queue.countsByRating ?? NO_COUNTS);
  const openCases = openByRating.High + openByRating.Medium + openByRating.Low;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header
        openByRating={queue.countsByRating ? openByRating : null}
        user={user}
        users={users}
        onUser={(u) => {
          chooseUser(u);
          // A status chosen for one role may not exist for the other.
          setFilter((f) => ({ ...f, status: "all" }));
        }}
        onJump={async (id) => {
          try {
            await fetchDetail(id);
          } catch (err) {
            // Any other failure still opens the tab, which shows the error and a retry.
            if (err instanceof NotFoundError) return false;
          }
          tabs.openTab(id);
          void navigate("/");
          return true;
        }}
        rulesOpen={rulesOpen}
        onToggleRules={() => void navigate(rulesOpen ? "/" : "/rules")}
      />

      <Routes>
        <Route path="/" element={null} />
        <Route path="/rules" element={<RulesPage author={user?.name ?? ""} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* NOTE: the review area stays mounted behind the rules page, so open tabs and half-written reasons survive. */}
      <div hidden={rulesOpen} className="flex min-h-0 flex-1 flex-col">
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
            statuses={ROLE_STATUSES[role]}
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
              role={role}
              onDecide={async (d) => {
                // The status goes to the engine's alerts; the reason is not stored yet.
                await setStatus(id, STATUS_CODE[d.action]);
                review.decide(id, { ...d, by: user?.name ?? "" });
              }}
              onOpen={tabs.openTab}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
