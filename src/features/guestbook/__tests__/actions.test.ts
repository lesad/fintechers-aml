import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the feature's query module so the real server-only db client is never loaded
// in happy-dom, and mock next/cache so revalidatePath is a no-op we can assert on.
vi.mock("../queries", () => ({ createGuestbookEntry: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action localizes validation messages via next-intl's server API, which needs
// a request scope we don't have in a unit test. Mock it with a no-override
// translator so Zod's built-in messages come through; zodErrorMap's mapping is
// covered directly in src/core/validation.test.ts.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

import { revalidatePath } from "next/cache";

import { submitGuestbook } from "../actions";
import { createGuestbookEntry } from "../queries";

function fd(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

describe("submitGuestbook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid input without inserting", async () => {
    const result = await submitGuestbook({ status: "idle" }, fd({ name: "", message: "" }));
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.fieldErrors.name).toBeDefined();
      expect(result.fieldErrors.message).toBeDefined();
    }
    expect(createGuestbookEntry).not.toHaveBeenCalled();
  });

  it("rejects a message containing a link (custom refine)", async () => {
    const result = await submitGuestbook(
      { status: "idle" },
      fd({ name: "Ada", message: "visit http://spam.example" }),
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.fieldErrors.message).toBeDefined();
    expect(createGuestbookEntry).not.toHaveBeenCalled();
  });

  it("inserts valid input and revalidates", async () => {
    const result = await submitGuestbook({ status: "idle" }, fd({ name: "Ada", message: "Hi" }));
    expect(result.status).toBe("success");
    expect(createGuestbookEntry).toHaveBeenCalledWith({ name: "Ada", message: "Hi" });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("returns a domain formError when the write throws", async () => {
    vi.mocked(createGuestbookEntry).mockRejectedValueOnce(new Error("db down"));
    const result = await submitGuestbook({ status: "idle" }, fd({ name: "Ada", message: "Hi" }));
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.formError).toBe("unexpected");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
