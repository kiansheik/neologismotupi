import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SourceCitation } from "@/components/source-citation";
import { useCurrentUser } from "@/features/auth/hooks";
import { listExamples, voteExample } from "@/features/examples/api";
import { CompactAudioPlayer } from "@/features/audio/components";
import { useI18n } from "@/i18n";
import { formatDate, statusToKey } from "@/i18n/formatters";
import { trackEvent } from "@/lib/analytics";
import { ApiError } from "@/lib/api";
import { useOrthography } from "@/lib/orthography";
import { getCachedVote, resolveVote, setCachedVote, useVoteMemoryVersion } from "@/lib/vote-memory";
import type { AudioSample, ExampleSummary } from "@/lib/types";

type ExampleSort = "recent" | "score";

interface ExampleBrowserProps {
  title: string;
  queryKey: string;
  titleAs?: "h1" | "h2" | "h3";
  description?: string;
  resultTitle?: string;
  emptyMessage?: string;
  compact?: boolean;
  initialSort?: ExampleSort;
  pageSize?: number;
  analyticsContext?: string;
}

function selectTopAudioSample(samples: AudioSample[] | null | undefined): AudioSample | null {
  if (!samples?.length) {
    return null;
  }
  return [...samples].sort((a, b) => {
    if (b.score_cache !== a.score_cache) {
      return b.score_cache - a.score_cache;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0] ?? null;
}

export function ExampleBrowser({
  title,
  queryKey,
  titleAs = "h2",
  description,
  resultTitle,
  emptyMessage,
  compact = false,
  initialSort = "recent",
  pageSize = 50,
  analyticsContext,
}: ExampleBrowserProps) {
  const { t, locale } = useI18n();
  const { apply, mapping, orthoMode } = useOrthography();
  const TitleTag = titleAs;
  const hasMounted = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  useVoteMemoryVersion();
  const [voteTargetId, setVoteTargetId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<ExampleSort>(initialSort);

  const navarroSearchTerms = useMemo<string[]>(() => {
    const lowered = search.toLowerCase();
    if (orthoMode !== "personal" || !mapping.length || !lowered.trim()) {
      return [lowered];
    }
    let variants = new Set<string>([lowered]);
    for (const item of mapping) {
      if (!item.from || !item.to) continue;
      const next = new Set<string>(variants);
      for (const v of variants) {
        if (v.includes(item.to)) {
          next.add(v.split(item.to).join(item.from));
        }
      }
      variants = next;
      if (variants.size > 16) break;
    }
    return [...variants];
  }, [search, orthoMode, mapping]);

  useEffect(() => {
    if (!analyticsContext) {
      return;
    }
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      trackEvent("examples_filter_changed", {
        context: analyticsContext,
        has_search: search.trim().length > 0,
        status: status || "all",
        sort,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [analyticsContext, search, sort, status]);

  const filters = useMemo(
    () => ({
      search: navarroSearchTerms[0] ?? search,
      search_terms: navarroSearchTerms.length > 1 ? navarroSearchTerms.slice(1) : undefined,
      status,
      sort,
    }),
    [navarroSearchTerms, search, status, sort],
  );

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["example-browser", queryKey, filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listExamples({
        ...filters,
        page: typeof pageParam === "number" ? pageParam : Number(pageParam),
        page_size: pageSize,
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

  const voteMutation = useMutation({
    mutationFn: (params: { exampleId: string; value: -1 | 1 }) =>
      voteExample(params.exampleId, { value: params.value }),
    onMutate: (params) => {
      setVoteTargetId(params.exampleId);
    },
    onSuccess: (_, params) => {
      setCachedVote(currentUser?.id, "example", params.exampleId, params.value);
      trackEvent("example_voted", {
        direction: params.value === 1 ? "up" : "down",
        context: analyticsContext ?? "example_list",
      });
      queryClient.invalidateQueries({ queryKey: ["example-browser"] });
    },
    onError: (error, params) => {
      trackEvent("example_vote_failed", {
        direction: params.value === 1 ? "up" : "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
        context: analyticsContext ?? "example_list",
      });
    },
    onSettled: () => {
      setVoteTargetId(null);
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

  const controlsGridClass = compact ? "mt-3 grid gap-3 sm:grid-cols-2" : "mt-3 grid gap-3 md:grid-cols-3";
  const showStatusFilter = Boolean(currentUser?.is_superuser);

  return (
    <>
      <Card className={compact ? "p-3" : undefined}>
        <TitleTag className="text-xl font-semibold text-brand-900">{title}</TitleTag>
        {description ? <p className="mt-1 text-sm text-slate-700">{description}</p> : null}
        <div className={controlsGridClass}>
          <Input
            aria-label={t("examples.searchAria")}
            value={search}
            placeholder={t("examples.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
          {showStatusFilter ? (
            <select
              className="rounded-md border border-brand-300 bg-surface-soft px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">{t("examples.allStatuses")}</option>
              <option value="pending">{t(statusToKey("pending"))}</option>
              <option value="approved">{t(statusToKey("approved"))}</option>
              <option value="rejected">{t(statusToKey("rejected"))}</option>
              <option value="hidden">{t(statusToKey("hidden"))}</option>
            </select>
          ) : null}
          <select
            className="rounded-md border border-brand-300 bg-surface-soft px-3 py-2 text-sm"
            value={sort}
            onChange={(event) => setSort(event.target.value as ExampleSort)}
          >
            <option value="recent">{t("examples.sort.recent")}</option>
            <option value="score">{t("examples.sort.score")}</option>
          </select>
        </div>
      </Card>

      <Card className={compact ? "p-3" : undefined}>
        <h3 className="text-base font-semibold text-brand-900">
          {resultTitle ?? t("examples.resultsTitle")}
        </h3>
        <div className="mt-4 space-y-3" data-testid="example-list">
          {isPending ? <p className="text-sm text-slate-600">{t("examples.loading")}</p> : null}
          {!isPending && !items.length ? (
            <p className="text-sm text-slate-600">{emptyMessage ?? t("examples.noMatches")}</p>
          ) : null}

          {items.map((example: ExampleSummary) => {
            const displayedExampleSourceCitation = example.source?.citation ?? example.source_citation;
            const exampleSourceWorkId = example.source?.work_id ?? null;
            const exampleSourceFirstUrl = example.source?.urls?.[0] ?? null;
            const exampleVote = resolveVote(
              example.current_user_vote,
              getCachedVote(currentUser?.id, "example", example.id),
            );
            const isVotingExample = voteMutation.isPending && voteTargetId === example.id;
            const topAudio = selectTopAudioSample(example.audio_samples);

            return (
              <article key={example.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-800">{apply(example.sentence_original)}</p>
                  <StatusBadge status={example.status} />
                </div>
                {example.translation_pt ? (
                  <p className="mt-1 text-xs text-slate-600">
                    {t("entry.translationPt")}: {example.translation_pt}
                  </p>
                ) : null}
                {displayedExampleSourceCitation ? (
                  <p className="mt-1 text-xs text-slate-600">
                    {t("entry.exampleSource")}: {" "}
                    <SourceCitation
                      citation={displayedExampleSourceCitation}
                      workId={exampleSourceWorkId}
                      firstUrl={exampleSourceFirstUrl}
                      t={t}
                    />
                  </p>
                ) : null}
                {topAudio ? (
                  <div className="mt-2 flex items-center gap-3">
                    <CompactAudioPlayer src={topAudio.url} t={t} size="sm" />
                    <p className="text-xs text-ink-muted">{t("audio.exampleTitle")}</p>
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <Link className="text-brand-700 hover:underline" to={`/entries/${example.entry_slug}`}>
                    {t("examples.inEntry", { headword: apply(example.entry_headword) })}
                  </Link>
                  {example.entry_gloss_pt ? (
                    <span className="text-slate-500">· {example.entry_gloss_pt}</span>
                  ) : null}
                  <span>{formatDate(example.created_at, locale)}</span>
                  {example.shared_entry_count ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      {t("examples.sharedEntries", { count: example.shared_entry_count })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-base leading-none shadow-sm transition-colors ${
                      exampleVote === 1
                        ? "border-vote-up-border bg-vote-up text-vote-up-text"
                        : "hover:border-brand-500 hover:bg-brand-50"
                    }`}
                    onClick={() => voteMutation.mutate({ exampleId: example.id, value: 1 })}
                    disabled={!currentUser || isVotingExample}
                    title={t("entry.upvote")}
                    aria-label={t("entry.upvote")}
                    aria-pressed={exampleVote === 1}
                  >
                    <span aria-hidden>{t("entry.upvoteEmoji")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-base leading-none shadow-sm transition-colors ${
                      exampleVote === -1
                        ? "border-vote-down-border bg-vote-down text-vote-down-text"
                        : "hover:border-red-500 hover:bg-red-100"
                    }`}
                    onClick={() => voteMutation.mutate({ exampleId: example.id, value: -1 })}
                    disabled={!currentUser || isVotingExample}
                    title={t("entry.downvote")}
                    aria-label={t("entry.downvote")}
                    aria-pressed={exampleVote === -1}
                  >
                    <span aria-hidden>{t("entry.downvoteEmoji")}</span>
                  </Button>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                    {t("entry.exampleScore", { score: example.score_cache })}
                  </span>
                </div>
              </article>
            );
          })}

          {isFetchingNextPage ? (
            <p className="text-sm text-slate-600">{t("examples.loadingMore")}</p>
          ) : null}
          {hasNextPage ? <div ref={loadMoreRef} className="h-1 w-full" aria-hidden /> : null}
        </div>
      </Card>
    </>
  );
}
