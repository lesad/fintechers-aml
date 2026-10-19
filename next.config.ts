import createNextIntlPlugin from "next-intl/plugin";

import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/core/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  typedRoutes: true,
  experimental: {
    // Strips `data-testid` from the build so the portable test-id system
    // (src/core/test/ids) doesn't ship to users. `compiler.reactRemoveProperties`
    // would do the same, but it is webpack-only and silently ignored by
    // Turbopack — hence the same SWC transform loaded here as a wasm plugin,
    // pinned to Next's own `swc_core` (16.2.4 -> v57 -> plugin 12.6.0). A
    // version mismatch fails the build loudly rather than silently.
    //
    // Gated on an explicit opt-in, never on NODE_ENV, so a production build
    // can still be tested against its `data-testid`s. Set
    // STRIP_TEST_IDS=1 in the deploy that serves real users only — which
    // deployment that is, is the app's business, not the template's. See ADR-0014.
    swcPlugins:
      process.env.STRIP_TEST_IDS === "1"
        ? [["@swc/plugin-react-remove-properties", { properties: ["^data-testid$"] }] as const]
        : [],
  },
};

export default withNextIntl(nextConfig);
