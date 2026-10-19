import { getTranslations } from "next-intl/server";

import { GuestbookForm, GuestbookList } from "@/features/guestbook";
import { submitGuestbook } from "@/features/guestbook/actions";
import { listGuestbook } from "@/features/guestbook/queries";

// The canonical "async RSC reads via a db service fn, then composes children"
// example. It passes the Server Action to the client form across the RSC boundary.
export default async function GuestbookPage() {
  const t = await getTranslations("guestbook");
  const entries = await listGuestbook();

  return (
    <main className="container mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <header>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </header>
      <GuestbookForm action={submitGuestbook} />
      <GuestbookList entries={entries} />
    </main>
  );
}
