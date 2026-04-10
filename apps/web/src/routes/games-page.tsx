import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";
import { useFlashcardStats } from "@/features/flashcards/hooks";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";

export function GamesPage() {
  const { locale, t } = useI18n();
  const { data: user } = useCurrentUser();
  const statsQuery = useFlashcardStats(Boolean(user));
  const [encouragementIndex, setEncouragementIndex] = useState(0);

  useEffect(() => {
    trackEvent("games_page_view");
  }, []);

  const encouragements = useMemo(
    () => [
      t("games.encouragements.1"),
      t("games.encouragements.2"),
      t("games.encouragements.3"),
      t("games.encouragements.4"),
    ],
    [t],
  );

  useEffect(() => {
    if (encouragements.length === 0) {
      return undefined;
    }
    const initialIndex = Math.floor(Math.random() * encouragements.length);
    setEncouragementIndex(initialIndex);
    if (encouragements.length < 2) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      setEncouragementIndex((prev) => {
        if (encouragements.length === 1) {
          return prev;
        }
        let next = prev;
        while (next === prev) {
          next = Math.floor(Math.random() * encouragements.length);
        }
        return next;
      });
    }, 8000);
    return () => window.clearInterval(interval);
  }, [encouragements]);

  const encouragement = encouragements[encouragementIndex] ?? "";
  const stats = statsQuery.data;
  const dailyStats = stats?.last_7_days ?? [];
  const maxTotal = Math.max(
    1,
    ...dailyStats.map((day) => day.reviews + day.new_seen),
  );
  const resolvedLocale = locale === "tupi-BR" ? "pt-BR" : locale;

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold text-brand-900">{t("games.title")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("games.description")}</p>
        <p className="mt-2 text-xs text-ink-muted">{t("games.progressNote")}</p>
        {!user ? (
          <p className="mt-2 text-xs text-amber-700">{t("games.signInHint")}</p>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-brand-900">
                {t("games.flashcards.title")}
              </p>
            </div>
            <Link
              to="/games/flashcards"
              className="inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-strong sm:w-auto"
            >
              {t("games.flashcards.cta")}
            </Link>
          </div>
          <div>
            <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
              <p className="text-xs font-medium text-slate-700">
                {t("games.activity.title")}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {t("games.activity.subtitle")}
              </p>
              {!user ? (
                <p className="mt-2 text-[11px] text-ink-muted">
                  {t("games.activity.signIn")}
                </p>
              ) : statsQuery.isLoading ? (
                <p className="mt-2 text-[11px] text-ink-muted">
                  {t("games.activity.loading")}
                </p>
              ) : statsQuery.isError ? (
                <p className="mt-2 text-[11px] text-ink-muted">
                  {t("games.activity.error")}
                </p>
              ) : dailyStats.length === 0 ? (
                <p className="mt-2 text-[11px] text-ink-muted">
                  {t("games.activity.empty")}
                </p>
              ) : (
                <div className="mt-3 flex items-end justify-between gap-2">
                  {dailyStats.map((day) => {
                    const total = day.reviews + day.new_seen;
                    const height = Math.max(8, Math.round((total / maxTotal) * 64));
                    const label = new Intl.DateTimeFormat(resolvedLocale, {
                      weekday: "short",
                    }).format(new Date(day.date));
                    return (
                      <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full max-w-[16px] rounded-md bg-brand-300"
                          style={{ height: `${height}px` }}
                          role="img"
                          aria-label={t("games.activity.barLabel", {
                            date: day.date,
                            total,
                          })}
                        />
                        <span className="text-[9px] text-ink-muted">{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="mt-3 text-sm text-ink-muted">{t("games.flashcards.description")}</p>
            <p className="mt-2 text-sm text-ink-muted">{t("games.flashcards.blurb")}</p>
            {encouragement ? (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-ink-muted">
                {encouragement}
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <p className="text-lg font-semibold text-brand-900">{t("games.comingSoon.title")}</p>
          <p className="mt-2 text-sm text-ink-muted">{t("games.comingSoon.body")}</p>
        </Card>
      </div>
    </div>
  );
}
