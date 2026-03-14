import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { applyZodErrors } from "@/lib/zod-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { register } from "@/features/auth/api";

type SignupForm = {
  email: string;
  password: string;
  display_name: string;
};

export function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const form = useForm<SignupForm>({
    defaultValues: {
      email: "",
      password: "",
      display_name: "",
    },
  });

  const signupMutation = useMutation({
    mutationFn: register,
    onSuccess: async (user) => {
      trackEvent("signup_success", { is_verified: user.is_verified });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      if (user.is_verified) {
        navigate("/entries");
        return;
      }
      navigate("/verify-email");
    },
    onError: (error) => {
      trackEvent("signup_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    form.clearErrors();
    const schema = z.object({
      email: z.string().trim().email(t("auth.error.invalidEmail")),
      password: z.string().min(8, t("auth.error.passwordMin")),
      display_name: z.string().trim().min(2, t("auth.error.displayNameMin")),
    });
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(parsed.error, form.setError);
      return;
    }
    signupMutation.mutate(parsed.data);
  });

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">{t("auth.signupTitle")}</h1>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          void onSubmit(event).catch(() => undefined);
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="display_name">
            {t("auth.displayName")}
          </label>
          <Input id="display_name" {...form.register("display_name")} />
          {form.formState.errors.display_name?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.display_name.message}</p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="email">
            {t("auth.email")}
          </label>
          <Input id="email" type="email" {...form.register("email")} />
          {form.formState.errors.email?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="password">
            {t("auth.password")}
          </label>
          <Input id="password" type="password" {...form.register("password")} />
          <p className="mt-1 text-xs text-slate-600">{t("auth.passwordHint")}</p>
          {form.formState.errors.password?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        {signupMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(signupMutation.error, t)}</p>
        ) : null}
        <Button type="submit" disabled={signupMutation.isPending}>
          {t("auth.signupButton")}
        </Button>
        <p className="text-sm text-slate-700">
          <Link className="text-brand-700 hover:underline" to="/recover">
            {t("auth.recoverLink")}
          </Link>
        </p>
      </form>
    </Card>
  );
}
