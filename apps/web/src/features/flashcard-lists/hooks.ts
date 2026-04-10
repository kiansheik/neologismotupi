import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { FlashcardList, FlashcardListCommentListResponse, FlashcardListDetail } from "@/lib/types";
import {
  addFlashcardListItem,
  createFlashcardList,
  createFlashcardListComment,
  getFlashcardList,
  listFlashcardListComments,
  listFlashcardLists,
  removeFlashcardListItem,
  updateFlashcardList,
  voteFlashcardList,
} from "@/features/flashcard-lists/api";
import type {
  FlashcardListCommentPayload,
  FlashcardListCreatePayload,
  FlashcardListItemPayload,
  FlashcardListSearchParams,
  FlashcardListUpdatePayload,
  FlashcardListVotePayload,
} from "@/features/flashcard-lists/api";

export function useFlashcardLists(params: FlashcardListSearchParams | undefined, enabled = true) {
  return useQuery({
    queryKey: ["flashcard-lists", params],
    queryFn: () => listFlashcardLists(params),
    enabled,
  });
}

export function useFlashcardListDetail(listId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["flashcard-list", listId],
    queryFn: () => getFlashcardList(String(listId)),
    enabled: enabled && Boolean(listId),
  });
}

export function useCreateFlashcardList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FlashcardListCreatePayload) => createFlashcardList(payload),
    onSuccess: (data: FlashcardList) => {
      queryClient.invalidateQueries({ queryKey: ["flashcard-lists"] });
      queryClient.setQueryData(["flashcard-list", data.id], (prev) =>
        prev ? { ...(prev as FlashcardListDetail), list: data } : prev,
      );
    },
  });
}

export function useUpdateFlashcardList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, payload }: { listId: string; payload: FlashcardListUpdatePayload }) =>
      updateFlashcardList(listId, payload),
    onSuccess: (data: FlashcardList) => {
      queryClient.invalidateQueries({ queryKey: ["flashcard-lists"] });
      queryClient.setQueryData(["flashcard-list", data.id], (prev) =>
        prev ? { ...(prev as FlashcardListDetail), list: data } : prev,
      );
    },
  });
}

export function useAddFlashcardListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, payload }: { listId: string; payload: FlashcardListItemPayload }) =>
      addFlashcardListItem(listId, payload),
    onSuccess: (data: FlashcardList) => {
      queryClient.invalidateQueries({ queryKey: ["flashcard-lists"] });
      queryClient.setQueryData(["flashcard-list", data.id], (prev) =>
        prev ? { ...(prev as FlashcardListDetail), list: data } : prev,
      );
    },
  });
}

export function useRemoveFlashcardListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, entryId }: { listId: string; entryId: string }) =>
      removeFlashcardListItem(listId, entryId),
    onSuccess: (data: FlashcardList) => {
      queryClient.invalidateQueries({ queryKey: ["flashcard-lists"] });
      queryClient.setQueryData(["flashcard-list", data.id], (prev) =>
        prev ? { ...(prev as FlashcardListDetail), list: data } : prev,
      );
    },
  });
}

export function useVoteFlashcardList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, payload }: { listId: string; payload: FlashcardListVotePayload }) =>
      voteFlashcardList(listId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["flashcard-lists"] });
      queryClient.invalidateQueries({ queryKey: ["flashcard-list", variables.listId] });
    },
  });
}

export function useFlashcardListComments(
  listId: string | null,
  params?: { page?: number; page_size?: number },
) {
  return useQuery<FlashcardListCommentListResponse>({
    queryKey: ["flashcard-list-comments", listId, params],
    queryFn: () => listFlashcardListComments(String(listId), params),
    enabled: Boolean(listId),
  });
}

export function useCreateFlashcardListComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      listId,
      payload,
    }: {
      listId: string;
      payload: FlashcardListCommentPayload;
    }) => createFlashcardListComment(listId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["flashcard-list-comments", variables.listId],
      });
    },
  });
}
