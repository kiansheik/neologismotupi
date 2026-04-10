import { apiFetch } from "@/lib/api";
import type {
  FlashcardList,
  FlashcardListComment,
  FlashcardListCommentListResponse,
  FlashcardListDetail,
  FlashcardListListResponse,
} from "@/lib/types";

export interface FlashcardListSearchParams {
  q?: string;
  owner_id?: string;
  entry_id?: string;
  page?: number;
  page_size?: number;
}

export interface FlashcardListCreatePayload {
  title_pt: string;
  title_en?: string | null;
  description_pt?: string | null;
  description_en?: string | null;
  theme_label?: string | null;
  is_public?: boolean;
}

export interface FlashcardListUpdatePayload {
  title_pt?: string | null;
  title_en?: string | null;
  description_pt?: string | null;
  description_en?: string | null;
  theme_label?: string | null;
  is_public?: boolean | null;
}

export interface FlashcardListItemPayload {
  entry_id: string;
}

export interface FlashcardListVotePayload {
  value: -1 | 1;
}

export interface FlashcardListCommentPayload {
  body: string;
}

function buildQuery(params?: FlashcardListSearchParams) {
  if (!params) return "";
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.owner_id) search.set("owner_id", params.owner_id);
  if (params.entry_id) search.set("entry_id", params.entry_id);
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listFlashcardLists(
  params?: FlashcardListSearchParams,
): Promise<FlashcardListListResponse> {
  return apiFetch<FlashcardListListResponse>(`/flashcard-lists${buildQuery(params)}`);
}

export function getFlashcardList(
  listId: string,
  params?: { page?: number; page_size?: number },
): Promise<FlashcardListDetail> {
  const query = params ? buildQuery(params) : "";
  return apiFetch<FlashcardListDetail>(`/flashcard-lists/${listId}${query}`);
}

export function createFlashcardList(
  payload: FlashcardListCreatePayload,
): Promise<FlashcardList> {
  return apiFetch<FlashcardList>("/flashcard-lists", {
    method: "POST",
    body: payload,
  });
}

export function updateFlashcardList(
  listId: string,
  payload: FlashcardListUpdatePayload,
): Promise<FlashcardList> {
  return apiFetch<FlashcardList>(`/flashcard-lists/${listId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function addFlashcardListItem(
  listId: string,
  payload: FlashcardListItemPayload,
): Promise<FlashcardList> {
  return apiFetch<FlashcardList>(`/flashcard-lists/${listId}/items`, {
    method: "POST",
    body: payload,
  });
}

export function removeFlashcardListItem(
  listId: string,
  entryId: string,
): Promise<FlashcardList> {
  return apiFetch<FlashcardList>(`/flashcard-lists/${listId}/items/${entryId}`, {
    method: "DELETE",
  });
}

export function voteFlashcardList(
  listId: string,
  payload: FlashcardListVotePayload,
): Promise<{ list_id: string; user_id: string; value: number; score_cache: number }> {
  return apiFetch(`/flashcard-lists/${listId}/vote`, {
    method: "POST",
    body: payload,
  });
}

export function listFlashcardListComments(
  listId: string,
  params?: { page?: number; page_size?: number },
): Promise<FlashcardListCommentListResponse> {
  const query = params ? buildQuery(params) : "";
  return apiFetch<FlashcardListCommentListResponse>(
    `/flashcard-lists/${listId}/comments${query}`,
  );
}

export function createFlashcardListComment(
  listId: string,
  payload: FlashcardListCommentPayload,
): Promise<FlashcardListComment> {
  return apiFetch<FlashcardListComment>(`/flashcard-lists/${listId}/comments`, {
    method: "POST",
    body: payload,
  });
}
