import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";
import { FlashcardSession } from "@/features/flashcards/components/flashcard-session";
import { FlashcardSettings } from "@/features/flashcards/components/flashcard-settings";
import { FlashcardSummary } from "@/features/flashcards/components/flashcard-summary";
import { useFlashcardReview, useFlashcardSession, useUpdateFlashcardSettings } from "@/features/flashcards/hooks";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";

export function FlashcardsPage() {
  const { t } = useI18n();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const sessionQuery = useFlashcardSession(Boolean(user));
  const updateSettingsMutation = useUpdateFlashcardSettings();
  const reviewMutation = useFlashcardReview();
  const completionTracked = useRef(false);

  useEffect(() => {
    trackEvent("flashcards_page_view");
  }, []);

  useEffect(() => {
    const session = sessionQuery.data;
    if (!session) {
      return;
    }
    if (session.summary.due_now > 0) {
      completionTracked.current = false;
      return;
    }
    if (!session.current_card && session.summary.completed_today > 0 && !completionTracked.current) {
      trackEvent("flashcard_session_completed");
      completionTracked.current = true;
    }
  }, [sessionQuery.data]);

  if (userLoading) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{t("flashcards.loading")}</p>
      </Card>
    );
  }

  if (!user && !userLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <h1 className="text-2xl font-semibold text-brand-900">{t("flashcards.title")}</h1>
          <p className="mt-2 text-sm text-ink-muted">{t("flashcards.subtitle")}</p>
        </Card>
        <Card>
          <p className="text-lg font-semibold text-brand-900">{t("flashcards.signInTitle")}</p>
          <p className="mt-2 text-sm text-ink-muted">{t("flashcards.signInBody")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/login">{t("flashcards.signInCtaLogin")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/signup">{t("flashcards.signInCtaSignup")}</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const session = sessionQuery.data;
  const isSessionLoading = sessionQuery.isLoading || sessionQuery.isFetching;
  const currentCard = session?.current_card ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold text-brand-900">{t("flashcards.title")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("flashcards.subtitle")}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <FlashcardSession
            card={currentCard}
            isLoading={isSessionLoading}
            isSubmitting={reviewMutation.isPending}
            onReview={(result, responseMs) => {
              if (!currentCard) {
                return;
              }
              reviewMutation.mutate({
                entry_id: currentCard.entry_id,
                direction: currentCard.direction,
                result,
                response_ms: responseMs,
              });
            }}
          />
        </div>
        <div className="space-y-4">
          {session ? (
            <FlashcardSummary summary={session.summary} />
          ) : (
            <Card>
              <p className="text-sm text-ink-muted">{t("flashcards.loading")}</p>
            </Card>
          )}
          {session ? (
            <FlashcardSettings
              value={session.settings.new_cards_per_day}
              isSaving={updateSettingsMutation.isPending}
              onCommit={(value) => {
                updateSettingsMutation.mutate(
                  { new_cards_per_day: value },
                  {
                    onSuccess: () => {
                      trackEvent("flashcard_settings_updated", { new_cards_per_day: value });
                    },
                  },
                );
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
