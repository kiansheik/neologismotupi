import { normalizeNoAccent } from "@/features/etymology-builder/orthography";
import type { NavarroEntry } from "@/lib/types";

import { fetchNavarroCache, getNavarroEntry } from "./api";

export type NavarroCacheEntry = NavarroEntry & {
  headwordNoAccent: string;
  headwordWithOptionalNoAccent: string;
  definitionNoAccent: string;
  index: number;
};

let cachePromise: Promise<NavarroCacheEntry[]> | null = null;
let cacheById: Map<string, NavarroEntry> | null = null;

export async function loadNavarroCache(): Promise<NavarroCacheEntry[]> {
  if (!cachePromise) {
    cachePromise = fetchNavarroCache().then((entries) =>
      entries.map((entry, index) => {
        const optional = entry.optional_number?.trim();
        const headwordWithOptional = optional
          ? `${entry.first_word} ${optional}`
          : entry.first_word;
        return {
          ...entry,
          headwordNoAccent: normalizeNoAccent(entry.first_word || ""),
          headwordWithOptionalNoAccent: normalizeNoAccent(headwordWithOptional || ""),
          definitionNoAccent: normalizeNoAccent(entry.definition || ""),
          index,
        };
      }),
    );
  }
  return cachePromise;
}

export function navarroKeyForEntry(
  firstWord: string,
  optionalNumber: string | null | undefined,
  definition: string | null | undefined,
): string {
  return `${firstWord}||${optionalNumber ?? ""}||${definition ?? ""}`;
}

export function buildNavarroLookup(entries: NavarroEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  entries.forEach((entry) => {
    const key = navarroKeyForEntry(entry.first_word, entry.optional_number, entry.definition);
    if (!map.has(key)) {
      map.set(key, entry.id);
    }
  });
  return map;
}

export async function getNavarroEntryCached(id: string): Promise<NavarroEntry> {
  const cache = await loadNavarroCache();
  if (!cacheById) {
    cacheById = new Map(cache.map((entry) => [entry.id, entry]));
  }
  const cached = cacheById.get(id);
  if (cached) {
    return cached;
  }
  return getNavarroEntry(id);
}

export function searchNavarroCache(
  entries: NavarroCacheEntry[],
  query: string,
  limit = 12,
): NavarroEntry[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const normalized = normalizeNoAccent(trimmed);
  const results: Array<{ rank: [number, number]; entry: NavarroCacheEntry }> = [];
  for (const entry of entries) {
    if (!normalized) {
      continue;
    }
    const exact =
      entry.headwordNoAccent === normalized ||
      entry.headwordWithOptionalNoAccent === normalized;
    const headwordMatch =
      entry.headwordNoAccent.includes(normalized) ||
      entry.headwordWithOptionalNoAccent.includes(normalized);
    const definitionMatch = entry.definitionNoAccent.includes(normalized);
    if (!exact && !headwordMatch && !definitionMatch) {
      continue;
    }
    const rank: [number, number] = [exact ? 0 : headwordMatch ? 1 : 2, entry.index];
    results.push({ rank, entry });
  }
  results.sort((a, b) => {
    if (a.rank[0] !== b.rank[0]) {
      return a.rank[0] - b.rank[0];
    }
    return a.rank[1] - b.rank[1];
  });
  return results.slice(0, limit).map((result) => ({
    id: result.entry.id,
    first_word: result.entry.first_word,
    optional_number: result.entry.optional_number,
    definition: result.entry.definition,
  }));
}
