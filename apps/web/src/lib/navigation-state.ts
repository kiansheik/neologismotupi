import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "nheenga:navigation:state:v1";
const MAX_SNAPSHOTS = 100;
const fallbackSnapshots = new Map<string, unknown>();

function readSnapshots(): Record<string, unknown> {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    return stored && typeof stored === "object" && !Array.isArray(stored)
      ? stored
      : {};
  } catch {
    return {};
  }
}

export function readNavigationState<T>(key: string, fallback: T): T {
  const value = fallbackSnapshots.has(key)
    ? fallbackSnapshots.get(key)
    : readSnapshots()[key];
  if (
    value === undefined ||
    value === null ||
    typeof value !== typeof fallback ||
    Array.isArray(value) !== Array.isArray(fallback)
  ) {
    return fallback;
  }
  return value as T;
}

export function writeNavigationState(key: string, value: unknown): void {
  try {
    const snapshots = readSnapshots();
    delete snapshots[key];
    snapshots[key] = value;
    const entries = Object.entries(snapshots).slice(-MAX_SNAPSHOTS);
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
    fallbackSnapshots.delete(key);
  } catch {
    // Keep Back/Forward working in memory when tab storage is unavailable or full.
    fallbackSnapshots.delete(key);
    fallbackSnapshots.set(key, value);
    if (fallbackSnapshots.size > MAX_SNAPSHOTS)
      fallbackSnapshots.delete(fallbackSnapshots.keys().next().value!);
  }
}

/** Private UI state stays in this tab, separate from public/shareable URL filters. */
export function usePageState<T>(
  name: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const { pathname } = useLocation();
  const key = `page:${pathname}:${name}`;
  const [state, setState] = useState(() => ({
    key,
    value: readNavigationState(key, initialValue),
  }));
  let current = state;
  if (state.key !== key) {
    current = { key, value: readNavigationState(key, initialValue) };
    setState(current);
  }
  const latest = useRef(current);
  latest.current = current;

  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const previous =
        latest.current.key === key
          ? latest.current.value
          : readNavigationState(key, initialValue);
      const value =
        typeof action === "function"
          ? (action as (previous: T) => T)(previous)
          : action;
      latest.current = { key, value };
      writeNavigationState(key, value);
      setState({ key, value });
    },
    [key],
  );

  return [current.value, update];
}

export function useRestoreResultPages(
  name: string,
  loadedPages: number,
  hasNextPage: boolean,
  isFetching: boolean,
  fetchNextPage: () => unknown,
) {
  const [savedPages, setSavedPages] = usePageState(`pages:${name}`, 1);
  const target =
    Number.isInteger(savedPages) && savedPages > 0 && savedPages <= 1000
      ? savedPages
      : 1;
  useEffect(() => {
    if (loadedPages > target) setSavedPages(loadedPages);
    else if (
      loadedPages > 0 &&
      loadedPages < target &&
      hasNextPage &&
      !isFetching
    )
      void fetchNextPage();
  }, [
    loadedPages,
    target,
    hasNextPage,
    isFetching,
    fetchNextPage,
    setSavedPages,
  ]);
}
