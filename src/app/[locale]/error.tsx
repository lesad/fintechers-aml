"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Route-segment error boundary. Must be a Client Component (it receives the
// `reset` callback). `useTranslations` works here because the `[locale]` layout
// already wraps children in `NextIntlClientProvider` with the full message set —
// this boundary renders *inside* that provider. Generic scaffolding: it survives
// `pnpm eject:examples` (every app wants a localized error page).
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");

  return (
    <main className="container mx-auto flex max-w-2xl flex-col items-start gap-4 p-8">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Button testId="error-retry" onClick={reset}>
        {t("retry")}
      </Button>
    </main>
  );
}
