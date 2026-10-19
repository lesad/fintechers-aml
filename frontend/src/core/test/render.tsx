// Test-only render helper. NOT re-exported from a `@/test` root barrel — it pulls
// `@testing-library/react`, which must never reach a client bundle. Import via
// `@/test/render`.
//
// The single seam for app-wide providers: every render gets a router (in memory, at
// `route`, `/` by default), as main.tsx gives the app a BrowserRouter.
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import type { ReactElement } from "react";

export function render(
  ui: ReactElement,
  { route = "/", ...options }: RenderOptions & { route?: string } = {},
) {
  return rtlRender(ui, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>,
    ...options,
  });
}

export { screen } from "@testing-library/react";
