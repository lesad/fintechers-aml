import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import { zodErrorMap } from "@/validation";

import messages from "../../messages/en.json";

// Real next-intl translator (no React/server context needed) — also proves the
// translator returned by useTranslations/getTranslations satisfies zodErrorMap.
const t = createTranslator({ locale: "en", messages, namespace: "validation" });
const firstError = (r: { error?: z.ZodError }) => r.error?.issues[0]?.message;

describe("zodErrorMap", () => {
  it("overrides a translated code with the validation namespace", () => {
    const r = z
      .string()
      .min(3)
      .safeParse("ab", { error: zodErrorMap(t) });
    expect(firstError(r)).toBe("Must be at least 3 characters");
  });

  it("interpolates issue params (minimum) into the message", () => {
    const r = z
      .number()
      .min(5)
      .safeParse(2, { error: zodErrorMap(t) });
    expect(firstError(r)).toBe("Must be at least 5");
  });

  it("maps a missing field to 'required' via the invalid_type→undefined rule", () => {
    const r = z.object({ name: z.string() }).safeParse({}, { error: zodErrorMap(t) });
    expect(firstError(r)).toBe("This field is required");
  });

  it("uses invalid_format.<format> for a translated format", () => {
    const r = z.email().safeParse("nope", { error: zodErrorMap(t) });
    expect(firstError(r)).toBe("Enter a valid email address");
  });

  it("falls through to Zod's default for an untranslated code", () => {
    const r = z
      .string()
      .max(2)
      .safeParse("abcd", { error: zodErrorMap(t) });
    const msg = firstError(r);
    expect(msg).toBeTruthy();
    expect(msg).not.toBe("Must be at least 2 characters"); // not our namespace
  });
});
