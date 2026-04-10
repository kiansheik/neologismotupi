import { apiFetch } from "@/lib/api";
import type {
  FlashcardActiveSession,
  FlashcardLeaderboard,
  FlashcardStats,
  FlashcardReviewResponse,
  FlashcardSession,
  FlashcardSettings,
  FlashcardDirection,
  FlashcardGrade,
} from "@/lib/types";

export interface UpdateFlashcardSettingsPayload {
  new_cards_per_day?: number;
  advanced_grading_enabled?: boolean;
}

export interface FlashcardReviewPayload {
  entry_id: string;
  direction: FlashcardDirection;
  grade: FlashcardGrade;
  response_ms: number | null;
  user_response?: string;
  list_id?: string | null;
}

export interface FinishFlashcardSessionPayload {
  remind_tomorrow?: boolean;
  time_zone?: string;
  offset_minutes?: number;
}

export interface FlashcardPresencePayload {
  status: "active" | "away";
}

export function getFlashcardSettings(): Promise<FlashcardSettings> {
  return apiFetch<FlashcardSettings>("/flashcards/settings");
}

export function updateFlashcardSettings(
  payload: UpdateFlashcardSettingsPayload,
): Promise<FlashcardSettings> {
  return apiFetch<FlashcardSettings>("/flashcards/settings", {
    method: "PATCH",
    body: payload,
  });
}

export function getFlashcardSession(listId?: string | null): Promise<FlashcardSession> {
  const query = listId ? `?list_id=${encodeURIComponent(listId)}` : "";
  return apiFetch<FlashcardSession>(`/flashcards/session${query}`);
}

export function submitFlashcardReview(
  payload: FlashcardReviewPayload,
): Promise<FlashcardReviewResponse> {
  return apiFetch<FlashcardReviewResponse>("/flashcards/review", {
    method: "POST",
    body: payload,
  });
}

export function finishFlashcardSession(
  payload?: FinishFlashcardSessionPayload,
): Promise<FlashcardActiveSession | null> {
  return apiFetch<FlashcardActiveSession | null>("/flashcards/finish-session", {
    method: "POST",
    body: payload ?? {},
  });
}

export function updateFlashcardPresence(
  payload: FlashcardPresencePayload,
): Promise<FlashcardActiveSession | null> {
  return apiFetch<FlashcardActiveSession | null>("/flashcards/session/presence", {
    method: "POST",
    body: payload,
    keepalive: true,
  });
}

export function getFlashcardStats(): Promise<FlashcardStats> {
  return apiFetch<FlashcardStats>("/flashcards/stats");
}

export function getFlashcardLeaderboard(): Promise<FlashcardLeaderboard> {
  return apiFetch<FlashcardLeaderboard>("/flashcards/leaderboard");
}
