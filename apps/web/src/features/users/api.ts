import { apiFetch, withQuery } from "@/lib/api";
import type { MentionUser, OrthographyMapItem, Profile, UserPreferences } from "@/lib/types";

export interface UpdateProfilePayload {
  display_name?: string;
  bio?: string | null;
  affiliation_label?: string | null;
  role_label?: string | null;
  website_url?: string | null;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  youtube_handle?: string | null;
  bluesky_handle?: string | null;
}

export function listMentionUsers(query: string, limit = 8): Promise<MentionUser[]> {
  return apiFetch<MentionUser[]>(withQuery("/users/mentions", { q: query, limit }));
}

export function resolveMentionUsers(handles: string[]): Promise<MentionUser[]> {
  return apiFetch<MentionUser[]>("/users/mentions/resolve", {
    method: "POST",
    body: { handles },
  });
}

export function updateMyProfile(payload: UpdateProfilePayload): Promise<Profile> {
  return apiFetch<Profile>("/users/me/profile", {
    method: "PATCH",
    body: payload,
  });
}

export interface UpdatePreferencesPayload {
  preferred_locale?: string;
  orthography_map?: OrthographyMapItem[];
}

export function getMyPreferences(): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/users/me/preferences");
}

export function updateMyPreferences(
  payload: UpdatePreferencesPayload,
): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/users/me/preferences", {
    method: "PATCH",
    body: payload,
  });
}
