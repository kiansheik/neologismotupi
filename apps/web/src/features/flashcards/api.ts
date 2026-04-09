import { apiFetch } from "@/lib/api";
import type {
  FlashcardActiveSession,
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

export function getFlashcardSession(): Promise<FlashcardSession> {
  return apiFetch<FlashcardSession>("/flashcards/session");
}

export function submitFlashcardReview(
  payload: FlashcardReviewPayload,
): Promise<FlashcardReviewResponse> {
  return apiFetch<FlashcardReviewResponse>("/flashcards/review", {
    method: "POST",
    body: payload,
  });
}

export function finishFlashcardSession(): Promise<FlashcardActiveSession | null> {
  return apiFetch<FlashcardActiveSession | null>("/flashcards/finish-session", {
    method: "POST",
  });
}

export function getFlashcardStats(): Promise<FlashcardStats> {
  return apiFetch<FlashcardStats>("/flashcards/stats");
}
