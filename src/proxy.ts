import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/i18n";

// Next 16 renamed the `middleware` file convention to `proxy` (the old name still
// works but logs a build-time deprecation). The `proxy` runtime is always `nodejs`
// and cannot be configured — fine here: next-intl's middleware runs on node.
export default createIntlMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
