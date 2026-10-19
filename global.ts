import { routing } from "@/i18n";

import messages from "./messages/en.json";

// Strictly type next-intl against the default-locale catalog: every message key
// (across all namespaces, including `validation`) is checked at the call site.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
