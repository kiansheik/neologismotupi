import { apiFetch, apiUpload } from "@/lib/api";
import type { AudioSample, AudioSubmissionListResponse, AudioVoteResponse } from "@/lib/types";

export function uploadEntryAudio(entryId: string, file: File): Promise<AudioSample> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<AudioSample>(`/entries/${entryId}/audio`, form);
}

export function uploadExampleAudio(exampleId: string, file: File): Promise<AudioSample> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<AudioSample>(`/examples/${exampleId}/audio`, form);
}

export function voteAudio(audioId: string, value: -1 | 1): Promise<AudioVoteResponse> {
  return apiFetch<AudioVoteResponse>(`/audio/${audioId}/vote`, {
    method: "POST",
    body: { value },
  });
}

export function deleteAudioVote(audioId: string): Promise<void> {
  return apiFetch<void>(`/audio/${audioId}/vote`, { method: "DELETE" });
}

export function deleteAudioSample(audioId: string): Promise<void> {
  return apiFetch<void>(`/audio/${audioId}`, { method: "DELETE" });
}

export function listUserAudioSubmissions(
  userId: string,
  params: { page?: number; page_size?: number } = {},
): Promise<AudioSubmissionListResponse> {
  const query = new URLSearchParams();
  if (params.page) {
    query.set("page", String(params.page));
  }
  if (params.page_size) {
    query.set("page_size", String(params.page_size));
  }
  const suffix = query.toString();
  return apiFetch<AudioSubmissionListResponse>(`/users/${userId}/audio${suffix ? `?${suffix}` : ""}`);
}
