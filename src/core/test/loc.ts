import type { TestIdNode } from "@/test/ids";
import type { Locator, Page } from "@playwright/test";

/**
 * Resolve a test-id tree node to a Playwright locator by chaining `getByTestId`
 * along the node's `$path` — e.g. `T.home.cta` → `page.getByTestId("home").getByTestId("cta")`.
 * Chains from the document root; mid-tree scoping is out of scope.
 */
export function loc(page: Page, node: TestIdNode): Locator {
  // $path is always non-empty for a real node, so the final reduced value is a Locator, not Page.
  return node.$path.reduce<Page | Locator>((scope, id) => scope.getByTestId(id), page) as Locator;
}
