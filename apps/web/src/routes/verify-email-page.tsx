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
import { verifyEmail } from "@/features/auth/api";

type VerifyForm = {
  token: string;
};

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get("token") ?? "";
  const { t } = useI18n();

  const form = useForm<VerifyForm>({
    defaultValues: {
      token: initialToken,
    },
  });

  const verifyMutation = useMutation({
    mutationFn: verifyEmail,
    onSuccess: () => {
      trackEvent("verify_email_success");
    },
    onError: (error) => {
      trackEvent("verify_email_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    form.clearErrors();
    const schema = z.object({
      token: z.string().trim().min(20, t("auth.error.tokenInvalid")),
    });
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(parsed.error, form.setError);
      return;
    }
    verifyMutation.mutate(parsed.data);
  });

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">{t("auth.verifyTitle")}</h1>
      <p className="mt-2 text-sm text-slate-700">{t("auth.verifyDescription")}</p>
      <p className="mt-1 text-xs text-slate-600">{t("form.requiredLegend")}</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          void onSubmit(event).catch(() => undefined);
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="token">
            {t("auth.verifyTokenLabel")} *
          </label>
          <Input id="token" {...form.register("token")} />
          {form.formState.errors.token?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.token.message}</p>
          ) : null}
        </div>

        {verifyMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(verifyMutation.error, t)}</p>
        ) : null}
        {verifyMutation.isSuccess ? (
          <p className="text-sm text-green-700">{t("auth.verifySuccess")}</p>
        ) : null}

        <Button type="submit" disabled={verifyMutation.isPending}>
          {t("auth.verifyButton")}
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
