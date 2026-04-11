import { apiFetch, withQuery } from "@/lib/api";
import type { NavarroEntry } from "@/lib/types";

export function searchNavarro(query: string, limit = 8): Promise<NavarroEntry[]> {
  return apiFetch<NavarroEntry[]>(withQuery("/navarro/search", { q: query, limit }));
}

export function getNavarroEntry(id: string): Promise<NavarroEntry> {
  return apiFetch<NavarroEntry>(`/navarro/${id}`);
}

export function fetchNavarroCache(): Promise<NavarroEntry[]> {
  return apiFetch<NavarroEntry[]>("/navarro/cache");
}
