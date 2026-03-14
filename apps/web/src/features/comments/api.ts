import { apiFetch } from "@/lib/api";
import type { EntryComment } from "@/lib/types";

export interface CreateCommentPayload {
  body: string;
  parent_comment_id?: string;
}

export interface VoteCommentPayload {
  value: -1 | 1;
}

export function createComment(entryId: string, payload: CreateCommentPayload): Promise<EntryComment> {
  return apiFetch<EntryComment>(`/entries/${entryId}/comments`, { method: "POST", body: payload });
}

export function voteComment(commentId: string, payload: VoteCommentPayload): Promise<{ score_cache: number }> {
  return apiFetch<{ score_cache: number }>(`/comments/${commentId}/vote`, { method: "POST", body: payload });
}

export function deleteCommentVote(commentId: string): Promise<void> {
  return apiFetch<void>(`/comments/${commentId}/vote`, { method: "DELETE" });
}
