import { apiFetch, withQuery } from "@/lib/api";
import type { SourceSuggestion } from "@/lib/types";

export interface ListSourcesParams {
  [key: string]: string | number | boolean | undefined;
  query: string;
  limit?: number;
}

export function listSources(params: ListSourcesParams): Promise<SourceSuggestion[]> {
  return apiFetch<SourceSuggestion[]>(withQuery("/sources", params));
}
