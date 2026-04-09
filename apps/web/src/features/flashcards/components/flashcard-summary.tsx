import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import type { FlashcardSessionSummary } from "@/lib/types";

interface FlashcardSummaryProps {
  summary: FlashcardSessionSummary;
}

export function FlashcardSummary({ summary }: FlashcardSummaryProps) {
  const { t } = useI18n();

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
        {t("flashcards.summary.title")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-ink-muted">{t("flashcards.summary.newRemaining")}</p>
          <p className="text-lg font-semibold text-brand-900">{summary.new_remaining}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">{t("flashcards.summary.reviewRemaining")}</p>
          <p className="text-lg font-semibold text-brand-900">{summary.review_remaining}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">{t("flashcards.summary.completedToday")}</p>
          <p className="text-lg font-semibold text-brand-900">{summary.completed_today}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">{t("flashcards.summary.dueNow")}</p>
          <p className="text-lg font-semibold text-brand-900">{summary.due_now}</p>
        </div>
      </div>
    </Card>
  );
}
