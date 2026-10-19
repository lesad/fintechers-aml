import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/middleware", () => ({
  default: () => (_request: NextRequest) => {
    const response = NextResponse.next();
    response.headers.set("x-intl-response", "1");
    return response;
  },
}));

describe("proxy", () => {
  it("returns the intl middleware response", async () => {
    const { default: proxy } = await import("@/proxy");
    const request = new NextRequest("http://localhost:3000/");

    const response = await proxy(request);

    expect(response.headers.get("x-intl-response")).toBe("1");
  });
});
