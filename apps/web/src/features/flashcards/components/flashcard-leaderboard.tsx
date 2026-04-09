import { Card } from "@/components/ui/card";
import { useFlashcardLeaderboard } from "@/features/flashcards/hooks";
import { useI18n } from "@/i18n";

interface FlashcardLeaderboardProps {
  enabled: boolean;
}

export function FlashcardLeaderboard({ enabled }: FlashcardLeaderboardProps) {
  const { t } = useI18n();
  const { data, isLoading } = useFlashcardLeaderboard(enabled);

  return (
    <Card>
      <p className="text-sm font-semibold text-brand-900">{t("flashcards.leaderboard.title")}</p>
      {isLoading ? (
        <p className="mt-2 text-xs text-ink-muted">{t("flashcards.leaderboard.loading")}</p>
      ) : !data?.entries.length ? (
        <p className="mt-2 text-xs text-ink-muted">{t("flashcards.leaderboard.empty")}</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="pb-1 pr-2 font-medium">{t("flashcards.leaderboard.rank")}</th>
              <th className="pb-1 pr-2 font-medium">{t("flashcards.leaderboard.name")}</th>
              <th className="pb-1 pr-2 text-right font-medium">
                {t("flashcards.leaderboard.thisWeek")}
              </th>
              <th className="pb-1 text-right font-medium">
                {t("flashcards.leaderboard.allTime")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => (
              <tr key={entry.rank} className="border-t border-line-soft">
                <td className="py-1.5 pr-2 text-xs text-ink-muted">{entry.rank}</td>
                <td className="py-1.5 pr-2 font-medium text-brand-900">{entry.display_name}</td>
                <td className="py-1.5 pr-2 text-right text-brand-800">{entry.reviews_this_week}</td>
                <td className="py-1.5 text-right text-ink-muted">{entry.total_reviews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
