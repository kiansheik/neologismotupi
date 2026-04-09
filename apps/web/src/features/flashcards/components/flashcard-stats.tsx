import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import type { FlashcardActiveSession, FlashcardStats } from "@/lib/types";

interface FlashcardStatsProps {
  stats: FlashcardStats | null | undefined;
  isLoading: boolean;
  activeSession: FlashcardActiveSession | null | undefined;
  onFinishSession?: () => void;
  isFinishing?: boolean;
  remindTomorrow?: boolean;
  onToggleRemind?: (value: boolean) => void;
}

function formatMinutes(value: number) {
  if (value < 60) {
    return `${value} min`;
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function FlashcardStatsPanel({
  stats,
  isLoading,
  activeSession,
  onFinishSession,
  isFinishing = false,
  remindTomorrow,
  onToggleRemind,
}: FlashcardStatsProps) {
  const { t, locale } = useI18n();
  const safeLocale = locale === "tupi-BR" ? "pt-BR" : locale;

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{t("flashcards.loading")}</p>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const days = stats.last_7_days;
  const maxMinutes = Math.max(1, ...days.map((day) => day.study_minutes));
  const isPaused = Boolean(activeSession?.is_paused);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
          {t("flashcards.stats.title")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-ink-muted">{t("flashcards.stats.reviews")}</p>
            <p className="text-lg font-semibold text-brand-900">{stats.today.reviews}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">{t("flashcards.stats.newSeen")}</p>
            <p className="text-lg font-semibold text-brand-900">{stats.today.new_seen}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">{t("flashcards.stats.minutes")}</p>
            <p className="text-lg font-semibold text-brand-900">
              {formatMinutes(stats.today.study_minutes)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">{t("flashcards.stats.sessions")}</p>
            <p className="text-lg font-semibold text-brand-900">{stats.today.sessions}</p>
          </div>
        </div>
        <div className="mt-4 border-t border-line-soft pt-4">
          {activeSession ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-ink-muted">
                  {isPaused
                    ? t("flashcards.stats.pausedSession")
                    : t("flashcards.stats.activeSession")}
                </p>
                <p className="text-sm font-semibold text-brand-900">
                  {formatMinutes(Math.floor(activeSession.elapsed_seconds / 60))}
                </p>
              </div>
              {onFinishSession && !isPaused ? (
                <div className="flex flex-col items-end gap-2">
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-line-strong text-brand-600"
                      checked={Boolean(remindTomorrow)}
                      onChange={(event) => onToggleRemind?.(event.target.checked)}
                    />
                    {t("flashcards.reminder.label")}
                  </label>
                  <Button type="button" onClick={onFinishSession} disabled={isFinishing}>
                    {t("flashcards.stats.finishSession")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">{t("flashcards.stats.noActiveSession")}</p>
          )}
        </div>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
          {t("flashcards.stats.weekTitle")}
        </p>
        <p className="mt-2 text-xs text-ink-muted">{t("flashcards.stats.weekHint")}</p>
        <div className="mt-4 flex items-end gap-2">
          {days.map((day) => {
            const height = Math.max(4, Math.round((day.study_minutes / maxMinutes) * 64));
            const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString(safeLocale, {
              weekday: "short",
            });
            return (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-full bg-brand-200/70"
                  style={{ height: `${height}px` }}
                  title={formatMinutes(day.study_minutes)}
                />
                <span className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
