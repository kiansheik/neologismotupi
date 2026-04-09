import { apiFetch, withQuery } from "@/lib/api";
import type { ExampleListResponse, ExampleVersion } from "@/lib/types";
import type { EntrySourceInput } from "@/features/entries/api";

export interface ReportExamplePayload {
  reason_code: string;
  free_text?: string;
}

export interface ExampleVotePayload {
  value: -1 | 1;
}

export interface ListExamplesParams {
  [key: string]: string | number | boolean | string[] | undefined;
  page?: number;
  page_size?: number;
  search?: string;
  search_terms?: string[];
  status?: string;
  sort?: "recent" | "score";
}

export interface UpdateExamplePayload {
  sentence_original?: string;
  translation_pt?: string | null;
  translation_en?: string | null;
  source_citation?: string | null;
  source?: EntrySourceInput | null;
  usage_note?: string | null;
  context_tag?: string | null;
  edit_summary?: string | null;
}

export function reportExample(exampleId: string, payload: ReportExamplePayload) {
  return apiFetch(`/examples/${exampleId}/reports`, { method: "POST", body: payload });
}

export function updateExample(exampleId: string, payload: UpdateExamplePayload) {
  return apiFetch(`/examples/${exampleId}`, { method: "PATCH", body: payload });
}

export function listExampleVersions(exampleId: string) {
  return apiFetch<ExampleVersion[]>(`/examples/${exampleId}/versions`);
}

export function listExamples(params: ListExamplesParams): Promise<ExampleListResponse> {
  return apiFetch<ExampleListResponse>(withQuery("/examples", params));
}

export function voteExample(exampleId: string, payload: ExampleVotePayload) {
  return apiFetch<{ score_cache: number }>(`/examples/${exampleId}/vote`, {
    method: "POST",
    body: payload,
  });
}

export function deleteExampleVote(exampleId: string) {
  return apiFetch<void>(`/examples/${exampleId}/vote`, { method: "DELETE" });
}
