import { action, field, group, tree } from "./tree";

// The app's single test-id tree — the first `T` instance (README documents the
// pattern). Field ids must match the react-hook-form field names + zod keys.
// Grow this per feature; eject removes it and restores the pristine `@/test` barrel.
export const T = tree({
  guestbook: group("guestbook", {
    name: field("name"),
    message: field("message"),
    submit: action("submit"),
  }),
});
