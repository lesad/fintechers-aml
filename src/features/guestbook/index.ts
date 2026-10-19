// Public API of the guestbook feature. Client-safe surface only — the route
// composes these. Server-only members stay OFF this barrel and are imported by
// direct path (`@/features/guestbook/{actions,queries}`) so a client bundle
// (or Storybook's Vite build) can never reach `@/db` → postgres through it
// (the ADR-0009 hazard). Their *types* are re-exported below as type-only —
// erased at build, so no runtime edge to the server modules.
export { GuestbookForm } from "./guestbook-form";
export { GuestbookList } from "./guestbook-list";
export { guestbookSchema, type GuestbookInput } from "./guestbook.schema";
export type { GuestbookFormState } from "./actions";
export type { GuestbookEntry } from "./queries";
