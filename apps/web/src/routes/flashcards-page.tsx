import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";
import { FlashcardLeaderboard } from "@/features/flashcards/components/flashcard-leaderboard";
import { FlashcardSession } from "@/features/flashcards/components/flashcard-session";
import { FlashcardStatsPanel } from "@/features/flashcards/components/flashcard-stats";
import { FlashcardSummary } from "@/features/flashcards/components/flashcard-summary";
import { useFlashcardListDetail, useFlashcardLists } from "@/features/flashcard-lists/hooks";
import { resolveFlashcardListTitle } from "@/features/flashcard-lists/lib";
import {
  useFinishFlashcardSession,
  useFlashcardReview,
  useFlashcardSession,
  useFlashcardStats,
  useFlashcardPresence,
} from "@/features/flashcards/hooks";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";

export function FlashcardsPage() {
  const { t, locale } = useI18n();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const listId = searchParams.get("list_id");
  const sessionQuery = useFlashcardSession(Boolean(user), listId);
  const listsQuery = useFlashcardLists({ owner_id: "me", page_size: 50 }, Boolean(user));
  const selectedListQuery = useFlashcardListDetail(listId, Boolean(listId));
  const statsQuery = useFlashcardStats(Boolean(user));
  const reviewMutation = useFlashcardReview(listId);
  const finishSessionMutation = useFinishFlashcardSession();
  const presenceMutation = useFlashcardPresence();
  const completionTracked = useRef(false);
  const sessionEnded = useRef(false);
  const [remindTomorrow, setRemindTomorrow] = useState(false);

  const session = sessionQuery.data;
  const isSessionLoading = sessionQuery.isLoading || sessionQuery.isFetching;
  const currentCard = session?.current_card ?? null;
  const activeSession = session?.active_session ?? null;
  const isPaused = Boolean(activeSession?.is_paused);
  const stats = statsQuery.data;
  const listItems = listsQuery.data?.items ?? [];
  const selectedList = selectedListQuery.data?.list ?? null;

  useEffect(() => {
    trackEvent("flashcards_page_view");
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (session.summary.due_now > 0 || session.summary.due_later_today > 0) {
      completionTracked.current = false;
      return;
    }
    if (!session.current_card && session.summary.completed_today > 0 && !completionTracked.current) {
      trackEvent("flashcard_session_completed");
      completionTracked.current = true;
    }
  }, [session]);

  useEffect(() => {
    if (!user || !activeSession || activeSession.is_paused) {
      return;
    }

    const markAway = () => {
      if (!activeSession || activeSession.is_paused) {
        return;
      }
      presenceMutation.mutate({ status: "away" });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        markAway();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", markAway);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", markAway);
      markAway();
    };
  }, [user, activeSession?.id, activeSession?.is_paused, presenceMutation.mutate]);

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
            <Link
              to="/login"
              className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-strong"
            >
              {t("flashcards.signInCtaLogin")}
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center rounded-md bg-surface-input px-4 py-2 text-sm font-medium text-brand-800 ring-1 ring-line-strong transition-colors hover:bg-surface-hover"
            >
              {t("flashcards.signInCtaSignup")}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold text-brand-900">{t("flashcards.title")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("flashcards.subtitle")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="font-medium text-ink">{t("flashcards.listLabel")}</span>
          <select
            className="rounded-md border border-line-strong bg-surface-input px-2 py-1 text-xs text-ink"
            value={listId ?? ""}
            onChange={(event) => {
              const next = event.target.value;
              const nextParams = new URLSearchParams(searchParams);
              if (!next) {
                nextParams.delete("list_id");
              } else {
                nextParams.set("list_id", next);
              }
              setSearchParams(nextParams);
              sessionEnded.current = false;
            }}
          >
            <option value="">{t("flashcards.listAll")}</option>
            {listItems.map((list) => (
              <option key={list.id} value={list.id}>
                {resolveFlashcardListTitle(list, locale)}
              </option>
            ))}
            {listId && !listItems.find((list) => list.id === listId) && selectedList ? (
              <option value={listId}>{resolveFlashcardListTitle(selectedList, locale)}</option>
            ) : null}
          </select>
          {listId && selectedList ? (
            <Link
              to={`/lists/${listId}`}
              className="text-brand-700 hover:underline"
            >
              {t("flashcards.viewList")}
            </Link>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {sessionEnded.current ? (
            <Card>
              <p className="text-lg font-semibold text-brand-900">
                {t("flashcards.sessionFinished.title")}
              </p>
              <p className="mt-2 text-sm text-ink-muted">{t("flashcards.sessionFinished.body")}</p>
              <div className="mt-4">
                <Button
                  type="button"
                  onClick={() => {
                    sessionEnded.current = false;
                    sessionQuery.refetch();
                    statsQuery.refetch();
                  }}
                >
                  {t("flashcards.sessionFinished.startNew")}
                </Button>
              </div>
            </Card>
          ) : isPaused ? (
            <Card>
              <p className="text-lg font-semibold text-brand-900">
                {t("flashcards.sessionPaused.title")}
              </p>
              <p className="mt-2 text-sm text-ink-muted">{t("flashcards.sessionPaused.body")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    presenceMutation.mutate(
                      { status: "active" },
                      {
                        onSuccess: () => {
                          sessionQuery.refetch();
                          statsQuery.refetch();
                        },
                      },
                    );
                  }}
                >
                  {t("flashcards.sessionPaused.continue")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    finishSessionMutation.mutate(undefined, {
                      onSuccess: () => {
                        sessionEnded.current = false;
                        sessionQuery.refetch();
                        statsQuery.refetch();
                      },
                    });
                  }}
                >
                  {t("flashcards.sessionPaused.startNew")}
                </Button>
              </div>
            </Card>
          ) : (
            <FlashcardSession
              card={currentCard}
              isLoading={isSessionLoading}
              isSubmitting={reviewMutation.isPending}
              dueLaterToday={session?.summary.due_later_today ?? 0}
              onReview={(result, responseMs, userResponse) => {
                if (!currentCard) {
                  return;
                }
                reviewMutation.mutate({
                  entry_id: currentCard.entry_id,
                  direction: currentCard.direction,
                  grade: result,
                  response_ms: responseMs,
                  user_response: userResponse,
                });
              }}
            />
          )}
        </div>
        <div className="space-y-4">
          {session ? (
            <FlashcardSummary summary={session.summary} />
          ) : (
            <Card>
              <p className="text-sm text-ink-muted">{t("flashcards.loading")}</p>
            </Card>
          )}
          <FlashcardLeaderboard enabled={Boolean(user)} />
          <FlashcardStatsPanel
            stats={stats}
            isLoading={statsQuery.isLoading || statsQuery.isFetching}
            activeSession={activeSession}
            isFinishing={finishSessionMutation.isPending}
            remindTomorrow={remindTomorrow}
            onToggleRemind={setRemindTomorrow}
            onFinishSession={() => {
              const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
              const offsetMinutes = new Date().getTimezoneOffset();
              const shouldRemind = remindTomorrow;
              finishSessionMutation.mutate(
                {
                  remind_tomorrow: shouldRemind,
                  time_zone: timeZone,
                  offset_minutes: offsetMinutes,
                },
                {
                  onSuccess: () => {
                    sessionEnded.current = true;
                    setRemindTomorrow(false);
                    trackEvent("flashcard_session_completed");
                    if (shouldRemind) {
                      trackEvent("flashcard_reminder_requested");
                    }
                    statsQuery.refetch();
                  },
                },
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
