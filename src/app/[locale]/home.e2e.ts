import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("agentic-next-app");
  await expect(page.getByRole("button", { name: /get started/i })).toBeVisible();
});
