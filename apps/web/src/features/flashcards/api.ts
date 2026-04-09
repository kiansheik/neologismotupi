import { apiFetch } from "@/lib/api";
import type {
  FlashcardReviewResponse,
  FlashcardSession,
  FlashcardSettings,
  FlashcardDirection,
  FlashcardReviewResult,
} from "@/lib/types";

export interface UpdateFlashcardSettingsPayload {
  new_cards_per_day: number;
}

export interface FlashcardReviewPayload {
  entry_id: string;
  direction: FlashcardDirection;
  result: FlashcardReviewResult;
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
