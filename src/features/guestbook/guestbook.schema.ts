import { z } from "zod";

// One schema, two consumers: the Server Action (authoritative, server-side)
// and the react-hook-form resolver (client-side UX). Keep field names in sync
// with the testid `field()` nodes in src/core/test/ids/app-ids.ts.
//
// NO inline messages on the built-in checks (`.min`, `.max`): an inline message
// is a per-issue override that wins over the error map, so it would defeat i18n.
// Messages come from the `validation` namespace via `zodErrorMap(t)`, passed per
// parse at each boundary (see @/validation). The `.refine` below is a CUSTOM
// error — its issue code is `custom`, so it maps to the `validation.custom` key.
const noLinks = (value: string) => !/https?:\/\//i.test(value);

export const guestbookSchema = z.object({
  name: z.string().min(1).max(80),
  message: z.string().min(1).max(500).refine(noLinks),
});

export type GuestbookInput = z.infer<typeof guestbookSchema>;
