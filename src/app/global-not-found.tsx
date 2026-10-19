"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";

import { routing } from "@/i18n";

import messages from "../../messages/en.json";

// Localized 404 for unmatched routes (Next.js 16 `global-not-found`). It needs no
// config flag on 16.2.4 — `experimental.globalNotFound` was measured to be a no-op
// here (404 status + this copy in `pnpm dev` and against `pnpm build`/`pnpm start`,
// identical route table either way), so the flag is gone. Unmatched URLs never enter the
// component tree, so a route-segment `not-found.tsx` can't localize them; this
// convention handles them at the routing level and, like `global-error.tsx`,
// renders OUTSIDE any layout — it owns its <html>/<body> and needs no root layout
// (which this app lacks; its root layout is `[locale]/layout.tsx`).
//
// Because there is no request locale for an unmatched URL, it stands up a
// default-locale provider with statically-imported messages — so the global 404
// is single-locale by construction. Generic scaffolding: survives `pnpm eject:examples`.
function GlobalNotFoundContent() {
  const t = useTranslations("errors");

  return (
    <main className="container mx-auto flex max-w-2xl flex-col items-start gap-4 p-8">
      <h1 className="text-3xl font-bold">{t("notFound.title")}</h1>
      <p className="text-muted-foreground">{t("notFound.description")}</p>
    </main>
  );
}

export default function GlobalNotFound() {
  return (
    <html lang={routing.defaultLocale}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider locale={routing.defaultLocale} messages={messages}>
          <GlobalNotFoundContent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
