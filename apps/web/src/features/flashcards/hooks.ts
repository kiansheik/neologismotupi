import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { FlashcardReviewResponse, FlashcardSession } from "@/lib/types";
import {
  getFlashcardSession,
  submitFlashcardReview,
  updateFlashcardSettings,
} from "@/features/flashcards/api";

export function useFlashcardSession(enabled: boolean) {
  return useQuery({
    queryKey: ["flashcards-session"],
    queryFn: getFlashcardSession,
    enabled,
  });
}

export function useUpdateFlashcardSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateFlashcardSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["flashcards-session"], (prev) => {
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

export function useFlashcardReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitFlashcardReview,
    onSuccess: (data: FlashcardReviewResponse) => {
      queryClient.setQueryData(["flashcards-session"], (prev) => {
        if (!prev) {
          return prev;
        }
        const session = prev as FlashcardSession;
        return {
          ...session,
          summary: data.summary,
          current_card: data.next_card,
        };
      });
    },
  });
}
