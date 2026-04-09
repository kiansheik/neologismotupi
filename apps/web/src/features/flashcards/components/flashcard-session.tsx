import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import type { FlashcardCard, FlashcardReviewResult } from "@/lib/types";

interface FlashcardSessionProps {
  card: FlashcardCard | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onReview: (result: FlashcardReviewResult, responseMs: number | null) => void;
}

export function FlashcardSession({
  card,
  isLoading,
  isSubmitting,
  onReview,
}: FlashcardSessionProps) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const promptAudioRef = useRef<HTMLAudioElement | null>(null);
  const revealAudioRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    if (!card || card.direction !== "headword_to_gloss" || !card.audio_url) {
      return;
    }
    const audio = promptAudioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [card?.entry_id, card?.direction, card?.audio_url]);

  useEffect(() => {
    if (!revealed || !card || card.direction !== "gloss_to_headword" || !card.audio_url) {
      return;
    }
    const audio = revealAudioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, [revealed, card?.entry_id, card?.direction, card?.audio_url]);

  const prompt = useMemo(() => {
    if (!card) {
      return "";
    }
    return card.direction === "headword_to_gloss" ? card.headword : card.gloss_pt;
  }, [card]);

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
    return card.queue_type === "new"
      ? t("flashcards.queue.new")
      : t("flashcards.queue.review");
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
      queue_type: card.queue_type,
    });
  };

  const handleReview = (result: FlashcardReviewResult) => {
    if (!card) {
      return;
    }
    onReview(result, responseMs);
    trackEvent("flashcard_review_submitted", {
      entry_id: card.entry_id,
      direction: card.direction,
      queue_type: card.queue_type,
      result,
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
          <div className="mt-3">
            <p className="text-xs text-ink-muted">{t("flashcards.audioLabel")}</p>
            <audio
              ref={promptAudioRef}
              src={card.audio_url}
              className="mt-2 w-full"
              controls
              preload="none"
            />
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
                <p className="text-base font-semibold text-brand-900">{card.headword}</p>
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
                <div>
                  <p className="text-xs text-ink-muted">{t("flashcards.audioLabel")}</p>
                  <audio
                    ref={revealAudioRef}
                    src={card.audio_url}
                    className="mt-2 w-full"
                    controls
                    preload="none"
                  />
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
            <Button
              type="button"
              variant="danger"
              onClick={() => handleReview("study_more")}
              disabled={isSubmitting}
            >
              {t("flashcards.grade.studyMore")}
            </Button>
            <Button
              type="button"
              onClick={() => handleReview("correct")}
              disabled={isSubmitting}
            >
              {t("flashcards.grade.correct")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
