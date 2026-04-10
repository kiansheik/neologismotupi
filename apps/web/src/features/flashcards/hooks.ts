import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { FlashcardActiveSession, FlashcardReviewResponse, FlashcardSession } from "@/lib/types";
import {
  finishFlashcardSession,
  getFlashcardLeaderboard,
  getFlashcardStats,
  getFlashcardSession,
  submitFlashcardReview,
  updateFlashcardPresence,
  updateFlashcardSettings,
} from "@/features/flashcards/api";
import type {
  FinishFlashcardSessionPayload,
  FlashcardPresencePayload,
  FlashcardReviewPayload,
} from "@/features/flashcards/api";

export function useFlashcardSession(enabled: boolean, listId?: string | null) {
  return useQuery({
    queryKey: ["flashcards-session", listId ?? "default"],
    queryFn: () => getFlashcardSession(listId),
    enabled,
  });
}

export function useUpdateFlashcardSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateFlashcardSettings,
    onSuccess: (data) => {
      queryClient.setQueriesData({ queryKey: ["flashcards-session"] }, (prev) => {
        if (!prev) {
          return prev;
        }
        const session = prev as FlashcardSession;
        return {
          ...session,
          settings: data,
        };
      });
    },
  });
}

export function useFlashcardReview(listId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FlashcardReviewPayload) =>
      submitFlashcardReview({
        ...payload,
        list_id: listId ?? undefined,
      }),
    onSuccess: (data: FlashcardReviewResponse) => {
      queryClient.setQueryData(["flashcards-session", listId ?? "default"], (prev) => {
        if (!prev) {
          return prev;
        }
        const session = prev as FlashcardSession;
        return {
          ...session,
          summary: data.summary,
          current_card: data.next_card,
          active_session: data.active_session,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["flashcards-stats"] });
    },
  });
}

export function useFinishFlashcardSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: FinishFlashcardSessionPayload) => finishFlashcardSession(payload),
    onSuccess: (data: FlashcardActiveSession | null) => {
      queryClient.setQueriesData({ queryKey: ["flashcards-session"] }, (prev) => {
        if (!prev) {
          return prev;
        }
        const session = prev as FlashcardSession;
        return {
          ...session,
          active_session: data,
        };
      });
    },
  });
}

export function useFlashcardPresence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FlashcardPresencePayload) => updateFlashcardPresence(payload),
    onSuccess: (data: FlashcardActiveSession | null) => {
      queryClient.setQueriesData({ queryKey: ["flashcards-session"] }, (prev) => {
        if (!prev) {
          return prev;
        }
        const session = prev as FlashcardSession;
        return {
          ...session,
          active_session: data,
        };
      });
    },
  });
}

export function useFlashcardStats(enabled: boolean) {
  return useQuery({
    queryKey: ["flashcards-stats"],
    queryFn: getFlashcardStats,
    enabled,
  });
}

export function useFlashcardLeaderboard(enabled: boolean) {
  return useQuery({
    queryKey: ["flashcards-leaderboard"],
    queryFn: getFlashcardLeaderboard,
    enabled,
    staleTime: 60_000,
  });
}
