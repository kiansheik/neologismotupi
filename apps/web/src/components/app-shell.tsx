import { Link, Outlet, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useCurrentUser } from "@/features/auth/hooks";
import { logout } from "@/features/auth/api";
import { getMyPreferences, updateMyPreferences } from "@/features/users/api";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { type Locale, useI18n } from "@/i18n";
import { initAnalytics, trackEvent, trackPageView } from "@/lib/analytics";
import { useOrthography } from "@/lib/orthography";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";
import { isTurnstileConfigured, preloadTurnstile } from "@/lib/turnstile";

export function AppShell() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { locale, setLocale, t } = useI18n();
  const { setMapping, orthoMode, setOrthoMode, mapping } = useOrthography();
  const lastLocaleSync = useRef<{ userId: string; locale: string } | null>(null);

  const updateLocaleMutation = useMutation({
    mutationFn: updateMyPreferences,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-preferences"] });
    },
  });

  const preferencesQuery = useQuery({
    queryKey: ["user-preferences"],
    queryFn: getMyPreferences,
    enabled: Boolean(user),
  });

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    trackPageView(path);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("utm_source") !== "newsletter") {
      return;
    }
    trackEvent("newsletter_visit", {
      utm_campaign: params.get("utm_campaign") ?? undefined,
      utm_content: params.get("utm_content") ?? undefined,
      utm_medium: params.get("utm_medium") ?? undefined,
    });
  }, [location.search]);

  useEffect(() => {
    if (!isTurnstileConfigured()) {
      return;
    }
    void preloadTurnstile();
  }, []);

  useEffect(() => {
    if (!user) {
      lastLocaleSync.current = null;
      return;
    }
    if (!preferencesQuery.isFetched) {
      return;
    }
    const next = { userId: user.id, locale };
    if (
      lastLocaleSync.current &&
      lastLocaleSync.current.userId === next.userId &&
      lastLocaleSync.current.locale === next.locale
    ) {
      return;
    }
    lastLocaleSync.current = next;
    updateLocaleMutation.mutate({ preferred_locale: locale });
  }, [locale, preferencesQuery.isFetched, updateLocaleMutation, user?.id]);

  useEffect(() => {
    if (!user || !preferencesQuery.data?.preferred_locale) {
      return;
    }
    const serverLocale = preferencesQuery.data.preferred_locale as Locale;
    if (serverLocale === locale) {
      lastLocaleSync.current = { userId: user.id, locale: serverLocale };
      return;
    }
    lastLocaleSync.current = { userId: user.id, locale: serverLocale };
    setLocale(serverLocale);
  }, [preferencesQuery.data?.preferred_locale, user?.id]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (!preferencesQuery.isFetched) {
      return;
    }
    setMapping(preferencesQuery.data?.orthography_map ?? []);
  }, [preferencesQuery.data?.orthography_map, preferencesQuery.isFetched, setMapping, user?.id]);

  const normalizedPath = location.pathname === "/entries" ? "/" : location.pathname;
  const hasDedicatedPageSeo =
    normalizedPath === "/" ||
    normalizedPath === "/entries" ||
    normalizedPath === "/about" ||
    normalizedPath.startsWith("/entries/") ||
    normalizedPath.startsWith("/sources/") ||
    normalizedPath.startsWith("/profiles/");
  const noindexRoutes = new Set([
    "/login",
    "/signup",
    "/recover",
    "/verify-email",
    "/reset-password",
    "/me",
    "/moderation",
    "/unsubscribe",
  ]);
  const shouldNoindex = [...noindexRoutes].some(
    (route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`),
  );

  let pageTitle = import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi";
  if (normalizedPath === "/submit") {
    pageTitle = `${t("submit.title")} | ${pageTitle}`;
  } else if (normalizedPath === "/games") {
    pageTitle = `${t("games.title")} | ${pageTitle}`;
  } else if (normalizedPath === "/games/flashcards") {
    pageTitle = `${t("flashcards.title")} | ${pageTitle}`;
  } else if (normalizedPath === "/login") {
    pageTitle = `${t("auth.loginTitle")} | ${pageTitle}`;
  } else if (normalizedPath === "/signup") {
    pageTitle = `${t("auth.signupTitle")} | ${pageTitle}`;
  } else if (normalizedPath === "/moderation") {
    pageTitle = `${t("moderation.title")} | ${pageTitle}`;
  } else if (normalizedPath === "/me") {
    pageTitle = `${t("me.title")} | ${pageTitle}`;
  } else if (normalizedPath === "/" || normalizedPath === "/entries") {
    pageTitle = `Dicionário vivo de Tupi | ${pageTitle}`;
  }

  useSeo({
    title: pageTitle,
    description:
      "Comunidade para registrar, buscar e discutir verbetes de Tupi - históricos e contemporâneos - com histórico aberto e moderação transparente.",
    canonicalPath: normalizedPath,
    noindex: shouldNoindex,
    locale,
    structuredData:
      normalizedPath === "/" || normalizedPath === "/entries"
        ? {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi",
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
      <header className="border-b border-line bg-surface-header/95 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="min-w-0 text-base font-semibold text-brand-800 sm:text-lg">
            {import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi"}
          </Link>
          <div className="flex w-full flex-wrap items-center gap-2 text-sm sm:w-auto sm:justify-end">
            <Link
              to="/entries"
              className="rounded-md px-2 py-1 text-brand-700 hover:bg-accent hover:text-accent-contrast"
            >
              {t("nav.entries")}
            </Link>
            <Link
              to="/games"
              className="rounded-md px-2 py-1 text-brand-700 hover:bg-accent hover:text-accent-contrast"
            >
              {t("nav.games")}
            </Link>
            <Link to="/submit" className="rounded-md px-2 py-1 text-brand-700 hover:bg-accent hover:text-accent-contrast">
              {t("nav.submit")}
            </Link>
            {user?.is_superuser ? (
              <Link
                to="/moderation"
                className="rounded-md px-2 py-1 text-brand-700 hover:bg-accent hover:text-accent-contrast"
              >
                {t("nav.moderation")}
              </Link>
            ) : null}
            {user ? (
              <>
                <Link to="/me" className="rounded-md px-2 py-1 text-brand-700 hover:bg-accent hover:text-accent-contrast">
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
                <Link to="/login" className="rounded-md px-2 py-1 text-brand-700 hover:bg-accent hover:text-accent-contrast">
                  {t("nav.login")}
                </Link>
                <Link
                  to="/signup"
                  className="rounded-md px-2 py-1 text-brand-700 hover:bg-accent hover:text-accent-contrast"
                >
                  {t("nav.signup")}
                </Link>
              </>
            )}
            {mapping.length > 0 ? (
              <div
                className="inline-flex shrink-0 overflow-hidden rounded-full border border-line-strong text-[11px] font-semibold"
                title={t("orthography.searchModeLabel")}
              >
                <button
                  type="button"
                  className={`px-2.5 py-1 transition-colors ${orthoMode === "navarro" ? "bg-brand-700 text-white" : "bg-surface-input text-ink-muted hover:bg-surface-hover"}`}
                  onClick={() => setOrthoMode("navarro")}
                >
                  {t("orthography.searchModeNavarro")}
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 transition-colors ${orthoMode === "personal" ? "bg-brand-700 text-white" : "bg-surface-input text-ink-muted hover:bg-surface-hover"}`}
                  onClick={() => setOrthoMode("personal")}
                >
                  {t("orthography.searchModePersonal")}
                </button>
              </div>
            ) : null}
            <ThemeToggle />
            <select
              aria-label={t("language.label")}
              className="rounded-md border border-line-strong bg-surface-input px-2 py-1 text-xs text-ink"
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
      <footer className="border-t border-line bg-surface-header/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-700">
          <p>{t("footer.tagline")}</p>
          <div className="inline-flex items-center gap-3">
            <Link to="/about" className="text-brand-700 hover:underline">
              {t("nav.about")}
            </Link>
            <a
              className="text-brand-700 hover:underline"
              href={(import.meta.env.VITE_GITHUB_URL as string | undefined)?.trim() || "https://github.com/kiansheik/neologismotupi"}
              target="_blank"
              rel="noreferrer"
            >
              {t("footer.github")}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
