import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { applyZodErrors } from "@/lib/zod-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/features/auth/api";

type ResetForm = {
  token: string;
  new_password: string;
};

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get("token") ?? "";
  const { t } = useI18n();

  const form = useForm<ResetForm>({
    defaultValues: {
      token: initialToken,
      new_password: "",
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      trackEvent("password_reset_success");
    },
    onError: (error) => {
      trackEvent("password_reset_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    form.clearErrors();
    const schema = z.object({
      token: z.string().trim().min(20, t("auth.error.tokenInvalid")),
      new_password: z.string().min(8, t("auth.error.passwordMin")),
    });
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(parsed.error, form.setError);
      return;
    }
    resetMutation.mutate(parsed.data);
  });

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">{t("auth.resetTitle")}</h1>
      <p className="mt-2 text-sm text-slate-700">{t("auth.resetDescription")}</p>
      <p className="mt-1 text-xs text-slate-600">{t("form.requiredLegend")}</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          void onSubmit(event).catch(() => undefined);
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="token">
            {t("auth.resetTokenLabel")} *
          </label>
          <Input id="token" {...form.register("token")} />
          {form.formState.errors.token?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.token.message}</p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="new_password">
            {t("auth.resetNewPasswordLabel")} *
          </label>
          <Input id="new_password" type="password" {...form.register("new_password")} />
          <p className="mt-1 text-xs text-slate-600">{t("auth.passwordHint")}</p>
          {form.formState.errors.new_password?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.new_password.message}</p>
          ) : null}
        </div>

        {resetMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(resetMutation.error, t)}</p>
        ) : null}
        {resetMutation.isSuccess ? (
          <p className="text-sm text-green-700">{t("auth.resetSuccess")}</p>
        ) : null}

        <Button type="submit" disabled={resetMutation.isPending}>
          {t("auth.resetButton")}
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
