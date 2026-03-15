import { Link, Outlet, useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useCurrentUser } from "@/features/auth/hooks";
import { logout } from "@/features/auth/api";
import { Button } from "@/components/ui/button";
import { type Locale, useI18n } from "@/i18n";
import { initAnalytics, trackEvent, trackPageView } from "@/lib/analytics";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";
import { isTurnstileConfigured, preloadTurnstile } from "@/lib/turnstile";

export function AppShell() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { locale, setLocale, t } = useI18n();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    trackPageView(path);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isTurnstileConfigured()) {
      return;
    }
    void preloadTurnstile();
  }, []);

  const normalizedPath = location.pathname === "/entries" ? "/" : location.pathname;
  const hasDedicatedPageSeo =
    normalizedPath === "/" ||
    normalizedPath === "/entries" ||
    normalizedPath.startsWith("/entries/") ||
    normalizedPath.startsWith("/profiles/");
  const noindexRoutes = new Set([
    "/login",
    "/signup",
    "/recover",
    "/verify-email",
    "/reset-password",
    "/me",
    "/moderation",
  ]);
  const shouldNoindex = [...noindexRoutes].some(
    (route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`),
  );

  let pageTitle = import.meta.env.VITE_APP_NAME ?? "Nheenga Neologismos";
  if (normalizedPath === "/submit") {
    pageTitle = `${t("submit.title")} | ${pageTitle}`;
  } else if (normalizedPath === "/login") {
    pageTitle = `${t("auth.loginTitle")} | ${pageTitle}`;
  } else if (normalizedPath === "/signup") {
    pageTitle = `${t("auth.signupTitle")} | ${pageTitle}`;
  } else if (normalizedPath === "/moderation") {
    pageTitle = `${t("moderation.title")} | ${pageTitle}`;
  } else if (normalizedPath === "/me") {
    pageTitle = `${t("me.title")} | ${pageTitle}`;
  } else if (normalizedPath === "/" || normalizedPath === "/entries") {
    pageTitle = `Dicionário vivo de Tupi moderno | ${pageTitle}`;
  }

  useSeo({
    title: pageTitle,
    description:
      "Comunidade para registrar, buscar e discutir verbetes de Tupi moderno com histórico e moderação transparente.",
    canonicalPath: normalizedPath,
    noindex: shouldNoindex,
    locale,
    structuredData:
      normalizedPath === "/" || normalizedPath === "/entries"
        ? {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: import.meta.env.VITE_APP_NAME ?? "Nheenga Neologismos",
            url: buildAbsoluteUrl("/"),
            inLanguage: "pt-BR",
            potentialAction: {
              "@type": "SearchAction",
              target: buildAbsoluteUrl("/?search={search_term_string}"),
              "query-input": "required name=search_term_string",
            },
          }
        : null,
    disabled: hasDedicatedPageSeo,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      trackEvent("logout_success");
      await queryClient.cancelQueries({ queryKey: ["me"] });
      queryClient.setQueryData(["me"], null);
    },
    onError: () => {
      trackEvent("logout_failed");
    },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#d8cbb4] bg-[#f8efde]/95 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="min-w-0 text-base font-semibold text-brand-800 sm:text-lg">
            {import.meta.env.VITE_APP_NAME ?? "Nheenga Neologismos"}
          </Link>
          <div className="flex w-full flex-wrap items-center gap-2 text-sm sm:w-auto sm:justify-end">
            <Link
              to="/entries"
              className="rounded-md px-2 py-1 text-brand-700 hover:bg-brand-700 hover:text-white"
            >
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
                  className="px-2 py-1"
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
              onChange={(event) => {
                const nextLocale = event.target.value as Locale;
                setLocale(nextLocale);
                trackEvent("locale_changed", { locale: nextLocale });
              }}
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
