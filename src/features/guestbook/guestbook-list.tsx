import { useTranslations } from "next-intl";

import type { GuestbookEntry } from "./queries";

// Presentational component (RSC by default — no "use client"). The RSC page fetches
// entries and passes them down, so this stays DB-free and unit-testable. `GuestbookEntry`
// is a type-only import — erased at build, so no server-only code reaches the browser.
export function GuestbookList({ entries }: { entries: GuestbookEntry[] }) {
  const t = useTranslations("guestbook");

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-border p-3">
          <p className="font-medium">{entry.name}</p>
          <p className="text-sm text-muted-foreground">{entry.message}</p>
        </li>
      ))}
    </ul>
  );
}
