import createIntlMiddleware from "next-intl/middleware";

import { routing } from "@/i18n";
import { updateSession } from "@/supabase/middleware";

import type { NextRequest } from "next/server";

const intlMiddleware = createIntlMiddleware(routing);

// Next 16 renamed the `middleware` file convention to `proxy` (the old name still
// works but logs a build-time deprecation). The `proxy` runtime is always `nodejs`
// and cannot be configured — fine here: next-intl's middleware and the Supabase
// `updateSession` refresh both run on node.
export default async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);
  return updateSession(request, response);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
