import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserBadge } from "@/components/user-badge";
import { listEntries } from "@/features/entries/api";
import { partOfSpeechLabel, statusToKey } from "@/i18n/formatters";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { entryDefinitionPreview } from "@/lib/entry-definition";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";

function normalizeComparableText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.?!,:;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function EntriesPage() {
  const { t, locale } = useI18n();
  const location = useLocation();
  const hasMounted = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [sort, setSort] = useState<"alphabetical" | "recent" | "score" | "most_examples">(
    "recent",
  );

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      trackEvent("entries_filter_changed", {
        has_search: search.trim().length > 0,
        status: status || "all",
        part_of_speech: partOfSpeech || "all",
        sort,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [partOfSpeech, search, sort, status]);

  const filters = useMemo(
    () => ({
      search,
      status,
      part_of_speech: partOfSpeech,
      sort,
    }),
    [search, status, partOfSpeech, sort],
  );

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["entries", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listEntries({
        ...filters,
        page: typeof pageParam === "number" ? pageParam : Number(pageParam),
        page_size: 50,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.items.length) {
        return undefined;
      }
      const loadedCount = allPages.reduce((total, page) => total + page.items.length, 0);
      return loadedCount < lastPage.total ? lastPage.page + 1 : undefined;
    },
  });

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  const canonicalPath = location.pathname === "/entries" ? "/" : location.pathname;
  useSeo({
    title: `Dicionário vivo de Tupi moderno | ${import.meta.env.VITE_APP_NAME ?? "Nheenga Neologismos"}`,
    description:
      "Busque e compare verbetes de Tupi moderno, com glosa, etimologia, exemplos de uso e validação comunitária.",
    canonicalPath,
    locale,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Verbetes de Tupi moderno",
      url: buildAbsoluteUrl(canonicalPath),
      inLanguage: "pt-BR",
      about: {
        "@type": "Language",
        name: "Tupi",
      },
    },
  });

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    const sentinel = loadMoreRef.current;
    if (!sentinel) {
      return;
    }
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }
        void fetchNextPage();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("entries.title")}</h1>
        <p className="mt-1 text-sm text-slate-700">
          Base comunitária de Tupi moderno para quem quer aprender, usar e revitalizar a língua no dia a dia.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Input
            aria-label={t("entries.searchAria")}
            value={search}
            placeholder={t("entries.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">{t("entries.allStatuses")}</option>
            <option value="pending">{t(statusToKey("pending"))}</option>
            <option value="approved">{t(statusToKey("approved"))}</option>
            <option value="disputed">{t(statusToKey("disputed"))}</option>
            <option value="rejected">{t(statusToKey("rejected"))}</option>
            <option value="archived">{t(statusToKey("archived"))}</option>
          </select>
          <select
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm"
            value={partOfSpeech}
            onChange={(event) => setPartOfSpeech(event.target.value)}
          >
            <option value="">{t("partOfSpeech.any")}</option>
            <option value="noun">{partOfSpeechLabel("noun", t)}</option>
            <option value="verb">{partOfSpeechLabel("verb", t)}</option>
            <option value="adjective">{partOfSpeechLabel("adjective", t)}</option>
            <option value="adverb">{partOfSpeechLabel("adverb", t)}</option>
            <option value="expression">{partOfSpeechLabel("expression", t)}</option>
            <option value="other">{partOfSpeechLabel("other", t)}</option>
          </select>
          <select
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm"
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as "alphabetical" | "recent" | "score" | "most_examples")
            }
          >
            <option value="alphabetical">{t("entries.sort.alphabetical")}</option>
            <option value="recent">{t("entries.sort.recent")}</option>
            <option value="score">{t("entries.sort.score")}</option>
            <option value="most_examples">{t("entries.sort.mostExamples")}</option>
          </select>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-brand-900">{t("entries.resultsTitle")}</h2>
        <div className="mt-4 space-y-3" data-testid="entry-list">
          {isPending ? <p className="text-sm text-slate-600">{t("entries.loading")}</p> : null}
          {!isPending && !items.length ? (
            <p className="text-sm text-slate-600">{t("entries.noMatches")}</p>
          ) : null}
          {items.map((entry) => {
            const normalizedGloss = normalizeComparableText(entry.gloss_pt);
            const normalizedDefinition = normalizeComparableText(entry.short_definition);
            const shouldShowGloss =
              normalizedGloss.length > 0 && normalizedGloss !== normalizedDefinition;

            return (
              <article key={entry.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    className="font-semibold text-brand-800 hover:underline"
                    to={`/entries/${entry.slug}`}
                    onClick={() => trackEvent("entry_opened_from_list", { status: entry.status })}
                  >
                    {entry.headword}
                  </Link>
                  <StatusBadge status={entry.status} />
                </div>
                {shouldShowGloss ? (
                  <p className="mt-1 text-sm font-medium text-slate-900">{entry.gloss_pt}</p>
                ) : null}
                <p className="mt-1 text-sm text-slate-700">{entryDefinitionPreview(entry.short_definition)}</p>
                <p className="mt-2 text-xs text-slate-600">
                  {t("entries.scoreExamples", {
                    score: entry.score_cache,
                    examples: entry.example_count_cache,
                  })}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <Link className="text-brand-700 hover:underline" to={`/profiles/${entry.proposer.id}`}>
                      {entry.proposer.display_name}
                    </Link>
                    <UserBadge displayName={entry.proposer.display_name} badges={entry.proposer.badges} />
                    <span>· {t("reputation.label", { score: entry.proposer.reputation_score })}</span>
                  </span>
                </p>
              </article>
            );
          })}
          {isFetchingNextPage ? <p className="text-sm text-slate-600">{t("entries.loadingMore")}</p> : null}
          {hasNextPage ? <div ref={loadMoreRef} className="h-1 w-full" aria-hidden /> : null}
        </div>
      </Card>
    </section>
  );
}
