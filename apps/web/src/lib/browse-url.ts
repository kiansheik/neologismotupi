import { useLayoutEffect, useRef } from "react";
import {
  useLocation,
  useNavigationType,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { normalizeApostrophes } from "@/lib/text";

export function readChoice<T extends string>(
  params: URLSearchParams,
  name: string,
  choices: readonly T[],
  fallback: T,
): T {
  const value = params.get(name);
  return choices.includes(value as T) ? (value as T) : fallback;
}

/** URL state is authoritative, including on POP and direct/shared-link navigation. */
export function useBrowseUrl() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const edit = useRef<{ query: string; time: number } | null>(null);
  const search = normalizeApostrophes(
    params.get("q") ?? params.get("search") ?? "",
  );

  useLayoutEffect(() => {
    if (navigationType === "POP") edit.current = null;
  }, [location.key, navigationType]);

  function setParam(name: string, value: string, defaultValue = "") {
    const next = new URLSearchParams(params);
    if (value === defaultValue) next.delete(name);
    else next.set(name, value);
    if (name === "sort") next.delete("unseen");
    if (next.toString() === params.toString()) return;
    edit.current = null;
    navigate(
      {
        pathname: location.pathname,
        search: next.toString(),
        hash: location.hash,
      },
      { preventScrollReset: true, state: location.state },
    );
  }

  function setSearch(value: string) {
    const query = normalizeApostrophes(value);
    if (query === search) return;
    const next = new URLSearchParams(params);
    next.delete("search");
    if (query) next.set("q", query);
    else next.delete("q");
    const now = Date.now();
    // One history entry per typing burst, rather than one per character.
    const replace = Boolean(
      edit.current &&
      edit.current.query === search &&
      now - edit.current.time < 700,
    );
    edit.current = { query, time: now };
    navigate(
      {
        pathname: location.pathname,
        search: next.toString(),
        hash: location.hash,
      },
      {
        replace,
        preventScrollReset: true,
        state: location.state,
      },
    );
  }

  return { params, search, setSearch, setParam };
}

export function browseTabUrl(path: string, params: URLSearchParams): string {
  const next = new URLSearchParams();
  const query = normalizeApostrophes(
    params.get("q") ?? params.get("search") ?? "",
  );
  if (query) next.set("q", query);
  const status = params.get("status");
  if (status && ["pending", "approved", "rejected"].includes(status))
    next.set("status", status);
  if (params.get("sort") === "score") next.set("sort", "score");
  return next.size ? `${path}?${next}` : path;
}
