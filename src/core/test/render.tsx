// Test-only render helper. NOT re-exported from a `@/test` root barrel — it pulls
// `@testing-library/react`, which must never reach a client bundle. Import via
// `@/test/render`.
//
// A thin re-export today: the next-intl provider wrapper it used to own went with
// the i18n layer (ADR-0025). Keep tests importing from here rather than from
// `@testing-library/react` directly, so any future app-wide provider (theme,
// data) is added in exactly one place.
export { render, screen } from "@testing-library/react";
