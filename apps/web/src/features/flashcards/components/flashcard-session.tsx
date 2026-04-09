import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompactAudioPlayer } from "@/features/audio/components";
import { useI18n } from "@/i18n";
import { useOrthography } from "@/lib/orthography";
import { trackEvent } from "@/lib/analytics";
import type { FlashcardCard, FlashcardGrade } from "@/lib/types";

interface FlashcardSessionProps {
  card: FlashcardCard | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onReview: (grade: FlashcardGrade, responseMs: number | null) => void;
  advancedGrading?: boolean;
  dueLaterToday?: number;
}

export function FlashcardSession({
  card,
  isLoading,
  isSubmitting,
  onReview,
  advancedGrading = false,
  dueLaterToday = 0,
}: FlashcardSessionProps) {
  const { t } = useI18n();
  const { apply } = useOrthography();
  const [revealed, setRevealed] = useState(false);
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [responseMs, setResponseMs] = useState<number | null>(null);

  useEffect(() => {
    if (!card) {
      setRevealed(false);
      setResponseMs(null);
      setShownAt(null);
      return;
    }
    setRevealed(false);
    setResponseMs(null);
    setShownAt(Date.now());
  }, [card?.entry_id, card?.direction]);

  const prompt = useMemo(() => {
    if (!card) {
      return "";
    }
    return card.direction === "headword_to_gloss" ? apply(card.headword) : card.gloss_pt;
  }, [apply, card]);

  const headwordLabel = useMemo(() => {
    if (!card) {
      return "";
    }
    return apply(card.headword);
  }, [apply, card]);

  const promptLabel = useMemo(() => {
    if (!card) {
      return "";
    }
    return card.direction === "headword_to_gloss"
      ? t("flashcards.prompt.headword")
      : t("flashcards.prompt.gloss");
  }, [card, t]);

  const queueLabel = useMemo(() => {
    if (!card) {
      return "";
    }
    if (card.queue === "new") {
      return t("flashcards.queue.new");
    }
    if (card.queue === "learn" || card.queue === "day_learn") {
      return t("flashcards.queue.learn");
    }
    return t("flashcards.queue.review");
  }, [card, t]);

  const handleReveal = () => {
    if (!card) {
      return;
    }
    const now = Date.now();
    const elapsed = shownAt ? Math.max(0, now - shownAt) : null;
    setResponseMs(elapsed);
    setRevealed(true);
    trackEvent("flashcard_reveal", {
      entry_id: card.entry_id,
      direction: card.direction,
      queue: card.queue,
    });
  };

  const handleReview = (grade: FlashcardGrade) => {
    if (!card) {
      return;
    }
    onReview(grade, responseMs);
    trackEvent("flashcard_review_submitted", {
      entry_id: card.entry_id,
      direction: card.direction,
      queue: card.queue,
      grade,
      response_ms: responseMs ?? undefined,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{t("flashcards.loading")}</p>
      </Card>
    );
  }

  if (!card) {
    return (
      <Card>
        <p className="text-lg font-semibold text-brand-900">{t("flashcards.emptyTitle")}</p>
        <p className="mt-2 text-sm text-ink-muted">{t("flashcards.emptyBody")}</p>
        {dueLaterToday > 0 ? (
          <p className="mt-3 text-xs text-ink-muted">
            {t("flashcards.emptyDueLater", { count: dueLaterToday })}
          </p>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">{queueLabel}</p>
        <p className="text-xs text-ink-muted">{promptLabel}</p>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-semibold text-brand-900">{prompt}</p>
        {card.audio_url && card.direction === "headword_to_gloss" ? (
          <div className="mt-3 flex items-center gap-3">
            <CompactAudioPlayer
              src={card.audio_url}
              t={t}
              size="sm"
              autoPlay
              autoPlayKey={`${card.entry_id}-${card.direction}`}
            />
            <p className="text-xs text-ink-muted">{t("flashcards.audioLabel")}</p>
          </div>
        ) : null}
      </div>
      {!revealed ? (
        <div className="mt-4">
          <Button type="button" onClick={handleReveal}>
            {t("flashcards.reveal")}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-line-soft bg-surface/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
              {t("flashcards.answerLabel")}
            </p>
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <p className="text-xs text-ink-muted">{t("flashcards.headwordLabel")}</p>
                <p className="text-base font-semibold text-brand-900">{headwordLabel}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">{t("flashcards.glossLabel")}</p>
                <p className="text-base font-semibold text-brand-900">{card.gloss_pt}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">{t("flashcards.definitionLabel")}</p>
                <p className="text-sm text-ink">{card.short_definition}</p>
              </div>
              {card.audio_url && card.direction === "gloss_to_headword" ? (
                <div className="flex items-center gap-3">
                  <CompactAudioPlayer
                    src={card.audio_url}
                    t={t}
                    size="sm"
                    autoPlay={revealed}
                    autoPlayKey={`${card.entry_id}-${card.direction}-reveal`}
                  />
                  <p className="text-xs text-ink-muted">{t("flashcards.audioLabel")}</p>
                </div>
              ) : null}
              {card.part_of_speech ? (
                <div>
                  <p className="text-xs text-ink-muted">{t("flashcards.partOfSpeechLabel")}</p>
                  <p className="text-sm text-ink">{card.part_of_speech}</p>
                </div>
              ) : null}
              <Link to={`/entries/${card.slug}`} className="text-sm font-medium text-brand-700 hover:underline">
                {t("flashcards.entryLink")}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {advancedGrading ? (
              <>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => handleReview("again")}
                  disabled={isSubmitting}
                >
                  {t("flashcards.grade.again")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleReview("hard")}
                  disabled={isSubmitting}
                >
                  {t("flashcards.grade.hard")}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleReview("good")}
                  disabled={isSubmitting}
                >
                  {t("flashcards.grade.good")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleReview("easy")}
                  disabled={isSubmitting}
                >
                  {t("flashcards.grade.easy")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => handleReview("again")}
                  disabled={isSubmitting}
                >
                  {t("flashcards.grade.studyMore")}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleReview("good")}
                  disabled={isSubmitting}
                >
                  {t("flashcards.grade.correct")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
