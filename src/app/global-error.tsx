"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";

import { routing } from "@/i18n";

import messages from "../../messages/en.json";

// Top-level boundary for errors thrown by the (effective) root layout itself.
// It renders *outside* the `[locale]` layout, so there is no ambient
// `NextIntlClientProvider` and no request locale to read — the error may predate
// locale resolution. We therefore stand up our own provider pinned to the
// DEFAULT locale with statically-imported messages. That is the key constraint:
// global-error can only ever be shown in one language.
//
// It must render its own <html>/<body> (it replaces the root layout) and is kept
// dependency-light — a plain <button>, no UI-kit imports — because it's the
// last-resort fallback loaded when everything else has already failed. Generic
// scaffolding: survives `pnpm eject:examples`.
function GlobalErrorContent({ reset }: { reset: () => void }) {
  const t = useTranslations("errors");

  return (
    <main className="container mx-auto flex max-w-2xl flex-col items-start gap-4 p-8">
      <h1 className="text-3xl font-bold">{t("global.title")}</h1>
      <p className="text-muted-foreground">{t("global.description")}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {t("retry")}
      </button>
    </main>
  );
}

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang={routing.defaultLocale}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider locale={routing.defaultLocale} messages={messages}>
          <GlobalErrorContent reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
