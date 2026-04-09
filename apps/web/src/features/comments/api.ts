import { apiFetch } from "@/lib/api";
import type { CommentVersion, EntryComment } from "@/lib/types";

export interface CreateCommentPayload {
  body: string;
  parent_comment_id?: string;
}

export interface VoteCommentPayload {
  value: -1 | 1;
}

export interface UpdateCommentPayload {
  body: string;
}

export function createComment(entryId: string, payload: CreateCommentPayload): Promise<EntryComment> {
  return apiFetch<EntryComment>(`/entries/${entryId}/comments`, { method: "POST", body: payload });
}

export function voteComment(commentId: string, payload: VoteCommentPayload): Promise<{ score_cache: number }> {
  return apiFetch<{ score_cache: number }>(`/comments/${commentId}/vote`, { method: "POST", body: payload });
}

export function updateComment(commentId: string, payload: UpdateCommentPayload): Promise<EntryComment> {
  return apiFetch<EntryComment>(`/comments/${commentId}`, { method: "PATCH", body: payload });
}

export function listCommentVersions(commentId: string): Promise<CommentVersion[]> {
  return apiFetch<CommentVersion[]>(`/comments/${commentId}/versions`);
}

export function deleteCommentVote(commentId: string): Promise<void> {
  return apiFetch<void>(`/comments/${commentId}/vote`, { method: "DELETE" });
}
