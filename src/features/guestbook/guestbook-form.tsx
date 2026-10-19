"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { T } from "@/test";
import { zodErrorMap } from "@/validation";

import { guestbookSchema, type GuestbookInput } from "./guestbook.schema";

import type { GuestbookFormState } from "./actions";

const initialState: GuestbookFormState = { status: "idle" };

export function GuestbookForm({
  action,
}: {
  action: (state: GuestbookFormState, formData: FormData) => Promise<GuestbookFormState>;
}) {
  const t = useTranslations("guestbook");
  const tv = useTranslations("validation");
  const [state, formAction, pending] = useActionState(action, initialState);

  // Client-side UX validation only — the Server Action re-validates and is authoritative.
  // `mode: "onBlur"` surfaces field errors without a handleSubmit wrapper, so the native
  // <form action> submission (progressive enhancement + FormData) stays intact.
  // `zodResolver`'s 2nd arg is forwarded to `parse`, so the same per-parse i18n
  // error map used server-side localizes client-side messages too.
  const {
    register,
    formState: { errors },
  } = useForm<GuestbookInput>({
    resolver: zodResolver(guestbookSchema, { error: zodErrorMap(tv) }),
    mode: "onBlur",
    defaultValues: { name: "", message: "" },
  });

  const nameError =
    errors.name?.message ?? (state.status === "error" ? state.fieldErrors.name?.[0] : undefined);
  const messageError =
    errors.message?.message ??
    (state.status === "error" ? state.fieldErrors.message?.[0] : undefined);

  return (
    <form action={formAction} data-testid={T.guestbook.$id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="gb-name" className="text-sm font-medium">
          {t("nameLabel")}
        </label>
        <Input
          id="gb-name"
          {...register("name")}
          testId={T.guestbook.name.$id}
          aria-invalid={Boolean(errors.name)}
        />
        {nameError ? <p className="text-sm text-destructive">{nameError}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="gb-message" className="text-sm font-medium">
          {t("messageLabel")}
        </label>
        <Textarea
          id="gb-message"
          {...register("message")}
          testId={T.guestbook.message.$id}
          aria-invalid={Boolean(errors.message)}
        />
        {messageError ? <p className="text-sm text-destructive">{messageError}</p> : null}
      </div>

      <Button type="submit" testId={T.guestbook.submit.$id} disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>

      {state.status === "success" ? <p className="text-sm text-primary">{t("success")}</p> : null}
      {state.status === "error" && state.formError ? (
        <p className="text-sm text-destructive">{t(`errors.${state.formError}`)}</p>
      ) : null}
    </form>
  );
}
