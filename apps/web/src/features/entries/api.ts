import { apiFetch, withQuery } from "@/lib/api";
import type { EntryDetail, EntryListResponse } from "@/lib/types";

export interface ListEntriesParams {
  [key: string]: string | number | boolean | undefined;
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  topic?: string;
  part_of_speech?: string;
  source?: string;
  region?: string;
  proposer_user_id?: string;
  mine?: boolean;
  sort?: "alphabetical" | "recent" | "score" | "most_examples";
}

export interface EntrySourceInput {
  authors?: string;
  title?: string;
  publication_year?: number;
  edition_label?: string;
  pages?: string;
}

export interface CreateEntryPayload {
  headword: string;
  gloss_pt: string;
  gloss_en?: string;
  part_of_speech?: string;
  short_definition?: string;
  source_citation?: string;
  source?: EntrySourceInput;
  morphology_notes?: string;
  tag_ids?: string[];
  force_submit?: boolean;
}

export interface UpdateEntryPayload {
  headword?: string;
  gloss_pt?: string;
  gloss_en?: string;
  part_of_speech?: string;
  short_definition?: string;
  source_citation?: string | null;
  source?: EntrySourceInput | null;
  morphology_notes?: string;
  tag_ids?: string[];
  edit_summary?: string;
}

export interface VotePayload {
  value: -1 | 1;
}

export interface CreateExamplePayload {
  sentence_original: string;
  translation_pt?: string;
  translation_en?: string;
  source_citation?: string;
  usage_note?: string;
  context_tag?: string;
}

export interface CreateReportPayload {
  reason_code: string;
  free_text?: string;
}

export function listEntries(params: ListEntriesParams): Promise<EntryListResponse> {
  return apiFetch<EntryListResponse>(withQuery("/entries", params));
}

export function getEntry(slug: string): Promise<EntryDetail> {
  return apiFetch<EntryDetail>(`/entries/${slug}`);
}

export function createEntry(payload: CreateEntryPayload): Promise<EntryDetail> {
  return apiFetch<EntryDetail>("/entries", { method: "POST", body: payload });
}

export function updateEntry(entryId: string, payload: UpdateEntryPayload): Promise<EntryDetail> {
  return apiFetch<EntryDetail>(`/entries/${entryId}`, { method: "PATCH", body: payload });
}

export function voteEntry(entryId: string, payload: VotePayload): Promise<{ score_cache: number }> {
  return apiFetch<{ score_cache: number }>(`/entries/${entryId}/vote`, {
    method: "POST",
    body: payload,
  });
}

export function deleteVote(entryId: string): Promise<void> {
  return apiFetch<void>(`/entries/${entryId}/vote`, { method: "DELETE" });
}

export function createExample(entryId: string, payload: CreateExamplePayload) {
  return apiFetch(`/entries/${entryId}/examples`, { method: "POST", body: payload });
}

export function reportEntry(entryId: string, payload: CreateReportPayload) {
  return apiFetch(`/entries/${entryId}/reports`, { method: "POST", body: payload });
}
