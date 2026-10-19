import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  },
}));

vi.mock("next-intl/middleware", () => ({
  default: () => (_request: NextRequest) => {
    const response = NextResponse.next();
    response.headers.set("x-intl-response", "1");
    return response;
  },
}));

type CookieToSet = { name: string; value: string; options?: object };

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (cookies: CookieToSet[]) => void } },
  ) => ({
    auth: {
      // Simulates a session refresh: Supabase writes new auth cookies
      // through the setAll handler during getUser().
      getUser: async () => {
        opts.cookies.setAll([
          { name: "sb-auth-token", value: "refreshed", options: { path: "/" } },
        ]);
        return { data: { user: null }, error: null };
      },
    },
  }),
}));

describe("proxy", () => {
  it("returns the intl response with Supabase-refreshed auth cookies attached", async () => {
    const { default: proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/");

    const response = await proxy(request);

    expect(response.headers.get("x-intl-response")).toBe("1");
    expect(response.cookies.get("sb-auth-token")?.value).toBe("refreshed");
  });
});
