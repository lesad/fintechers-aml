import { expect, test } from "@playwright/test";

import { loc, T } from "@/test";

// First loc() + testids caller. Drives the form by test-id (not role/text), then
// asserts the new entry renders. NOTE: this writes to the local dev DB (not rolled
// back) — repeated runs accumulate rows, which is harmless locally.
test("a visitor can sign the guestbook", async ({ page }) => {
  await page.goto("/guestbook");

  await loc(page, T.guestbook.name).fill("Ada Lovelace");
  await loc(page, T.guestbook.message).fill("First to sign!");
  await loc(page, T.guestbook.submit).click();

  await expect(page.getByText("First to sign!").first()).toBeVisible();
});
