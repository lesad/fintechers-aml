import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../messages/en.json";

import type { Locale } from "next-intl";
import type { ReactNode } from "react";

// Test-only render helper. NOT re-exported from the `@/test` root barrel — it pulls
// `@testing-library/react`, which must never reach a client bundle (same reason
// `db.ts` is deep-only; see ./index.ts). Import via `@/test/render`.
//
// Centralizes the one `messages/en.json` import and the `NextIntlClientProvider`
// wrapper so tests don't repeat either. `messages` is re-exported for assertions
// against localized strings (e.g. `messages.guestbook.empty`).
export { messages };
export { screen } from "@testing-library/react";

export function renderWithIntl(ui: ReactNode, locale: Locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}
