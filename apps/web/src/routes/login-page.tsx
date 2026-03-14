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
import { login } from "@/features/auth/api";

type LoginForm = {
  email: string;
  password: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const form = useForm<LoginForm>({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      trackEvent("login_success");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/entries");
    },
    onError: (error) => {
      trackEvent("login_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    form.clearErrors();
    const schema = z.object({
      email: z.string().trim().email(t("auth.error.invalidEmail")),
      password: z.string().min(8, t("auth.error.passwordMin")),
    });
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      applyZodErrors(parsed.error, form.setError);
      return;
    }
    loginMutation.mutate(parsed.data);
  });

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">{t("auth.loginTitle")}</h1>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          void onSubmit(event).catch(() => undefined);
        }}
      >
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
        {loginMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(loginMutation.error, t)}</p>
        ) : null}
        <Button type="submit" disabled={loginMutation.isPending}>
          {t("auth.loginButton")}
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
