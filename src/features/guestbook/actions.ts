"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { zodErrorMap } from "@/validation";

import { guestbookSchema } from "./guestbook.schema";
import { createGuestbookEntry } from "./queries";

export type GuestbookFormState =
  | { status: "idle" }
  | { status: "success" }
  // `fieldErrors` = per-field validation (Zod). `formError` = a domain error the
  // input shape can't predict (the write failed) — a typed code the client maps
  // to a translated message.
  | { status: "error"; fieldErrors: Record<string, string[]>; formError?: "unexpected" };

export async function submitGuestbook(
  _prev: GuestbookFormState,
  formData: FormData,
): Promise<GuestbookFormState> {
  // Localize validation messages server-side too (the action is authoritative).
  // Per-parse error map — never `z.config()`, which races under RSC concurrency.
  const t = await getTranslations("validation");
  const parsed = guestbookSchema.safeParse(
    { name: formData.get("name"), message: formData.get("message") },
    { error: zodErrorMap(t) },
  );

  if (!parsed.success) {
    // Build field errors from the stable `issues` array (version-proof across zod v3/v4).
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { status: "error", fieldErrors };
  }

  // Domain (non-validation) error path: the write can fail for reasons the input
  // shape can't predict (DB down, constraint, RLS). Surface it as a typed
  // `formError` code, distinct from the per-field validation errors above.
  try {
    await createGuestbookEntry(parsed.data);
  } catch {
    return { status: "error", fieldErrors: {}, formError: "unexpected" };
  }

  // Dynamic route revalidation: revalidate the /[locale]/guestbook page for all params.
  revalidatePath("/[locale]/guestbook", "page");
  return { status: "success" };
}
