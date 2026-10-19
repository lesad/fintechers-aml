import createNextIntlPlugin from "next-intl/plugin";

import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/core/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  // Playwright targets 127.0.0.1, but the dev server's own origin is `localhost`,
  // so Next classifies 127.0.0.1 as cross-origin and blocks `/_next/webpack-hmr`.
  // Without that socket the Turbopack dev client never boots: the page serves
  // correct SSR HTML but never hydrates, so every interactive e2e fails while
  // SSR-presence assertions still pass. `pnpm start` has no dev-origin guard, so
  // the breakage is dev-only — CI stays green and only local runs break.
  allowedDevOrigins: ["127.0.0.1"],
  typedRoutes: true,
  experimental: {
    // Strips `data-testid` from the build so the portable test-id system
    // (src/core/test/ids) doesn't ship to users. `compiler.reactRemoveProperties`
    // would do the same, but it is webpack-only and silently ignored by
    // Turbopack — hence the same SWC transform loaded here as a wasm plugin,
    // pinned to Next's own `swc_core` (16.2.4 -> v57 -> plugin 12.6.0). A
    // version mismatch fails the build loudly rather than silently.
    //
    // Gated on an explicit opt-in, never on NODE_ENV: CI runs e2e against a
    // production build (`pnpm start`) and every *.e2e.ts selects on
    // `data-testid`, so a NODE_ENV gate breaks the e2e job. Set
    // STRIP_TEST_IDS=1 in the deploy that serves real users only — which
    // deployment that is, is the app's business, not the template's. See ADR-0014.
    swcPlugins:
      process.env.STRIP_TEST_IDS === "1"
        ? [["@swc/plugin-react-remove-properties", { properties: ["^data-testid$"] }] as const]
        : [],
  },
};

export default withNextIntl(nextConfig);
