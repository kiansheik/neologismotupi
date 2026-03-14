import { Link, Outlet } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/features/auth/hooks";
import { logout } from "@/features/auth/api";
import { Button } from "@/components/ui/button";
import { type Locale, useI18n } from "@/i18n";

export function AppShell() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { locale, setLocale, t } = useI18n();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: ["me"] });
      queryClient.setQueryData(["me"], null);
    },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#d8cbb4] bg-[#f8efde]/95 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold text-brand-800">
            {import.meta.env.VITE_APP_NAME ?? "Nheenga Neologismos"}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/entries" className="rounded-md px-2 py-1 text-brand-700 hover:bg-brand-700 hover:text-white">
              {t("nav.entries")}
            </Link>
            <Link to="/submit" className="rounded-md px-2 py-1 text-brand-700 hover:bg-brand-700 hover:text-white">
              {t("nav.submit")}
            </Link>
            {user?.is_superuser ? (
              <Link
                to="/moderation"
                className="rounded-md px-2 py-1 text-brand-700 hover:bg-brand-700 hover:text-white"
              >
                {t("nav.moderation")}
              </Link>
            ) : null}
            {user ? (
              <>
                <Link to="/me" className="rounded-md px-2 py-1 text-brand-700 hover:bg-brand-700 hover:text-white">
                  {t("nav.me")}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  {t("nav.logout")}
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="rounded-md px-2 py-1 text-brand-700 hover:bg-brand-700 hover:text-white">
                  {t("nav.login")}
                </Link>
                <Link
                  to="/signup"
                  className="rounded-md px-2 py-1 text-brand-700 hover:bg-brand-700 hover:text-white"
                >
                  {t("nav.signup")}
                </Link>
              </>
            )}
            <select
              aria-label={t("language.label")}
              className="rounded-md border border-[#d3c6b0] bg-[#fffaf2] px-2 py-1 text-xs"
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              <option value="pt-BR">{t("language.pt-BR")}</option>
              <option value="tupi-BR">{t("language.tupi-BR")}</option>
              <option value="en-US">{t("language.en-US")}</option>
            </select>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
