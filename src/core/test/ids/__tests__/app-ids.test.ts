import { describe, expect, it } from "vitest";

import { T } from "@/test";

describe("app testid tree", () => {
  it("exposes the guestbook group with field + action leaves", () => {
    expect(T.guestbook.$id).toBe("guestbook");
    expect(T.guestbook.name.$path).toEqual(["guestbook", "name"]);
    expect(T.guestbook.message.$path).toEqual(["guestbook", "message"]);
    expect(T.guestbook.submit.$path).toEqual(["guestbook", "submit"]);
  });
});
