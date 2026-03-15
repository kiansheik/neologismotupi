import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { applyZodErrors } from "@/lib/zod-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/features/auth/api";

type RecoverForm = {
  email: string;
};

export function RecoverAccountPage() {
  const { t } = useI18n();

  const form = useForm<RecoverForm>({
    defaultValues: {
      email: "",
    },
  });

  const recoverMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      trackEvent("password_reset_requested");
    },
    onError: (error) => {
      trackEvent("password_reset_request_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    form.clearErrors();
    const schema = z.object({
      email: z.string().trim().email(t("auth.error.invalidEmail")),
    });
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(parsed.error, form.setError);
      return;
    }
    recoverMutation.mutate(parsed.data);
  });

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">{t("auth.recoverTitle")}</h1>
      <p className="mt-2 text-sm text-slate-700">{t("auth.recoverDescription")}</p>
      <p className="mt-1 text-xs text-slate-600">{t("form.requiredLegend")}</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          void onSubmit(event).catch(() => undefined);
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="email">
            {t("auth.email")} *
          </label>
          <Input id="email" type="email" {...form.register("email")} />
          {form.formState.errors.email?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.email.message}</p>
          ) : null}
        </div>

        {recoverMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(recoverMutation.error, t)}</p>
        ) : null}
        {recoverMutation.isSuccess ? (
          <p className="text-sm text-green-700">{t("auth.recoverSuccess")}</p>
        ) : null}

        <Button type="submit" disabled={recoverMutation.isPending}>
          {t("auth.recoverButton")}
        </Button>
      </form>
      <p className="mt-4 text-sm text-slate-700">
        <Link className="text-brand-700 hover:underline" to="/login">
          {t("auth.backToLogin")}
        </Link>
      </p>
    </Card>
  );
}
