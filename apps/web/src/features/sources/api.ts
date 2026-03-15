import { apiFetch, withQuery } from "@/lib/api";
import type { SourceDetail, SourceSuggestion } from "@/lib/types";

export interface ListSourcesParams {
  [key: string]: string | number | boolean | undefined;
  query: string;
  limit?: number;
}

export function listSources(params: ListSourcesParams): Promise<SourceSuggestion[]> {
  return apiFetch<SourceSuggestion[]>(withQuery("/sources", params));
}

export function getSourceDetail(workId: string): Promise<SourceDetail> {
  return apiFetch<SourceDetail>(`/sources/${workId}`);
}
