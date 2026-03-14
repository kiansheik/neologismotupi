import { apiFetch, withQuery } from "@/lib/api";
import type { MentionUser } from "@/lib/types";

export function listMentionUsers(query: string, limit = 8): Promise<MentionUser[]> {
  return apiFetch<MentionUser[]>(withQuery("/users/mentions", { q: query, limit }));
}

export function resolveMentionUsers(handles: string[]): Promise<MentionUser[]> {
  return apiFetch<MentionUser[]>("/users/mentions/resolve", {
    method: "POST",
    body: { handles },
  });
}
