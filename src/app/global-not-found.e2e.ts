import { expect, test } from "@playwright/test";

// Unmatched routes render the localized `global-not-found.tsx` (Next 16 file
// convention, no config flag — see ADR-0018) with a 404 status.
test("unknown routes render the localized 404", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Page not found");
});
