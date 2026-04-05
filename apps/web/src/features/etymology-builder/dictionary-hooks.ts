import { useEffect, useMemo, useState } from "react";

import { loadDictionaryIndex, searchDictionary } from "./dictionary-search";
import type { SearchIndexEntry, SearchResult } from "./dictionary-search";

export function useDictionaryIndex() {
  const [index, setIndex] = useState<SearchIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadDictionaryIndex()
      .then((loaded) => {
        if (!active) return;
        setIndex(loaded);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar o dicionário.");
      });
    return () => {
      active = false;
    };
  }, []);

  return { index, error };
}

export function useDictionaryResults(index: SearchIndexEntry[] | null, query: string, limit = 12): SearchResult[] {
  return useMemo(() => {
    if (!index) return [];
    if (!query.trim()) return [];
    return searchDictionary(index, query).slice(0, limit);
  }, [index, query, limit]);
}
