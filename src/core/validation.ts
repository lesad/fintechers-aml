import type * as z from "zod";

/**
 * Localize Zod v4 error messages through a next-intl translator.
 *
 * Two layers, small on purpose:
 *  - Defaults come from Zod itself (English by default) — nothing to configure.
 *  - Overrides come from a `validation` message namespace whose keys mirror
 *    Zod's issue taxonomy. Only the codes you translate are overridden; every
 *    other code returns `undefined` and falls through to Zod's default.
 *
 * Always pass the returned map *per parse* — never via `z.config()`. `z.config`
 * mutates module-global state, which races across concurrent RSC / Server Action
 * requests. A per-parse map carries no shared state and is safe under Next.js
 * concurrency, in both server and client bundles.
 *
 *   // server
 *   const t = await getTranslations("validation");
 *   schema.safeParse(input, { error: zodErrorMap(t) });
 *
 *   // client (react-hook-form) — zodResolver forwards its 2nd arg to parse
 *   zodResolver(schema, { error: zodErrorMap(useTranslations("validation")) });
 */

/**
 * Minimal shape of a next-intl translator scoped to a namespace. Kept structural
 * (not imported from next-intl) so both `useTranslations(ns)` and the awaited
 * `getTranslations(ns)` satisfy it, and the module carries no next-intl types.
 * `K` captures next-intl's statically-known key union (strict when messages are
 * typed, `string` otherwise) so any translator assigns without widening at the
 * call site. `values` mirrors next-intl's own interpolation-value type so a real
 * translator is assignable here.
 */
type MessageValues = Record<string, string | number | Date>;
type Translator<K extends string> = {
  (key: K, values?: MessageValues): string;
  has: (key: K) => boolean;
};

/** Codes whose message depends on a discriminator field → key gains a suffix. */
const REFINE = {
  too_small: "origin",
  too_big: "origin",
  invalid_format: "format",
} as const;

/**
 * Derive the message key from an issue by convention, so the "mapping" lives in
 * the JSON catalog (which mirrors this taxonomy) rather than in code here.
 *   invalid_type on a missing field → "required"
 *   too_small / too_big            → "too_small.<origin>"  (e.g. too_small.string)
 *   invalid_format                 → "invalid_format.<format>" (e.g. invalid_format.email)
 *   everything else                → "<code>"
 */
function messageKey(iss: z.core.$ZodRawIssue): string {
  const code = String(iss.code);
  if (code === "invalid_type" && iss.input === undefined) return "required";
  const field = REFINE[code as keyof typeof REFINE];
  return field ? `${code}.${String(iss[field])}` : code;
}

/** Build a per-parse Zod error map backed by a next-intl `validation` translator. */
export function zodErrorMap<K extends string>(t: Translator<K>): z.core.$ZodErrorMap {
  return (iss) => {
    // Keys are derived from the issue at runtime, so they're outside next-intl's
    // statically-known union `K`; the `has` guard below makes this assertion safe.
    const key = messageKey(iss) as K;
    if (!t.has(key)) return undefined;
    // Zod issue fields are `unknown`; next-intl coerces interpolation values at
    // runtime and ignores unused keys, so forwarding the whole issue is safe.
    return t(key, iss as MessageValues);
  };
}
