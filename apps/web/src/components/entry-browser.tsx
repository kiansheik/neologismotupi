import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserBadge } from "@/components/user-badge";
import { useCurrentUser } from "@/features/auth/hooks";
import { getEntryConstraints, listEntries, voteEntry } from "@/features/entries/api";
import { createComment } from "@/features/comments/api";
import { partOfSpeechLabel, statusToKey } from "@/i18n/formatters";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { ApiError } from "@/lib/api";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { entryDefinitionPreview } from "@/lib/entry-definition";
import { getCachedVote, resolveVote, setCachedVote, useVoteMemoryVersion } from "@/lib/vote-memory";

type EntrySort = "alphabetical" | "recent" | "score" | "most_examples" | "unseen";

interface EntryBrowserScope {
  proposer_user_id?: string;
  source_work_id?: string;
}

interface EntryBrowserProps {
  title: string;
  queryKey: string;
  titleAs?: "h1" | "h2" | "h3";
  description?: string;
  resultTitle?: string;
  emptyMessage?: string;
  scope?: EntryBrowserScope;
  compact?: boolean;
  initialSort?: EntrySort;
  pageSize?: number;
  analyticsContext?: string;
  allowUnseenFilter?: boolean;
}

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

export function EntryBrowser({
  title,
  queryKey,
  titleAs = "h2",
  description,
  resultTitle,
  emptyMessage,
  scope,
  compact = false,
  initialSort = "recent",
  pageSize = 50,
  analyticsContext,
  allowUnseenFilter = false,
}: EntryBrowserProps) {
  const { t } = useI18n();
  const TitleTag = titleAs;
  const hasMounted = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  useVoteMemoryVersion();
  const [voteTargetId, setVoteTargetId] = useState<string | null>(null);
  const [downvoteDrafts, setDownvoteDrafts] = useState<Record<string, string>>({});
  const [downvoteOpen, setDownvoteOpen] = useState<Record<string, boolean>>({});
  const [downvoteErrors, setDownvoteErrors] = useState<Record<string, string>>({});
  const canVote = Boolean(currentUser);

  const constraintsQuery = useQuery({
    queryKey: ["entry-constraints"],
    queryFn: getEntryConstraints,
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [sort, setSort] = useState<EntrySort>(initialSort);

  useEffect(() => {
    if (!analyticsContext) {
      return;
    }
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      trackEvent("entries_filter_changed", {
        context: analyticsContext,
        has_search: search.trim().length > 0,
        status: status || "all",
        part_of_speech: partOfSpeech || "all",
        sort,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [analyticsContext, partOfSpeech, search, sort, status]);

  useEffect(() => {
    if (!allowUnseenFilter && sort === "unseen") {
      setSort("recent");
    }
  }, [allowUnseenFilter, sort]);

  const filters = useMemo(
    () => ({
      search,
      status,
      part_of_speech: partOfSpeech,
      sort,
      unseen: sort === "unseen" ? true : undefined,
      proposer_user_id: scope?.proposer_user_id,
      source_work_id: scope?.source_work_id,
    }),
    [search, status, partOfSpeech, sort, scope?.proposer_user_id, scope?.source_work_id],
  );

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["entry-browser", queryKey, filters],
      initialPageParam: 1,
      queryFn: ({ pageParam }) =>
        listEntries({
          ...filters,
          page: typeof pageParam === "number" ? pageParam : Number(pageParam),
          page_size: pageSize,
        }),
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage.items.length) {
          return undefined;
        }
        const loadedCount = allPages.reduce(
          (total, page) => total + page.items.length,
          0,
        );
        return loadedCount < lastPage.total ? lastPage.page + 1 : undefined;
      },
    });

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const voteMutation = useMutation({
    mutationFn: (params: { entryId: string; value: -1 | 1 }) =>
      voteEntry(params.entryId, { value: params.value }),
    onMutate: (params) => {
      setVoteTargetId(params.entryId);
    },
    onSuccess: (_, params) => {
      setCachedVote(currentUser?.id, "entry", params.entryId, params.value);
      trackEvent("entry_voted", {
        direction: params.value === 1 ? "up" : "down",
        context: analyticsContext ?? "entry_list",
      });
      queryClient.invalidateQueries({ queryKey: ["entry-browser"] });
    },
    onError: (error, params) => {
      trackEvent("entry_vote_failed", {
        direction: params.value === 1 ? "up" : "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
        context: analyticsContext ?? "entry_list",
      });
    },
    onSettled: () => {
      setVoteTargetId(null);
    },
  });

  const downvoteWithCommentMutation = useMutation({
    mutationFn: async (params: { entryId: string; body: string }) => {
      await createComment(params.entryId, { body: params.body });
      return voteEntry(params.entryId, { value: -1 });
    },
    onMutate: (params) => {
      setVoteTargetId(params.entryId);
    },
    onSuccess: (_, params) => {
      setCachedVote(currentUser?.id, "entry", params.entryId, -1);
      trackEvent("entry_voted", {
        direction: "down",
        context: analyticsContext ?? "entry_list",
      });
      queryClient.invalidateQueries({ queryKey: ["entry-browser"] });
      setDownvoteOpen((current) => ({ ...current, [params.entryId]: false }));
      setDownvoteDrafts((current) => ({ ...current, [params.entryId]: "" }));
      setDownvoteErrors((current) => ({ ...current, [params.entryId]: "" }));
    },
    onError: (error, params) => {
      trackEvent("entry_vote_failed", {
        direction: "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
        context: analyticsContext ?? "entry_list",
      });
      setDownvoteErrors((current) => ({
        ...current,
        [params.entryId]:
          error instanceof ApiError ? getLocalizedApiErrorMessage(error, t) : t("api.request_failed"),
      }));
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

  const controlsGridClass = compact
    ? "mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    : "mt-3 grid gap-3 md:grid-cols-4";

  return (
    <>
      <Card className={compact ? "p-3" : undefined}>
        <TitleTag className="text-xl font-semibold text-brand-900">
          {title}
        </TitleTag>
        {description ? (
          <p className="mt-1 text-sm text-slate-700">{description}</p>
        ) : null}
        <div className={controlsGridClass}>
          <Input
            aria-label={t("entries.searchAria")}
            value={search}
            placeholder={t("entries.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-md border border-brand-300 bg-surface-soft px-3 py-2 text-sm"
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
            className="rounded-md border border-brand-300 bg-surface-soft px-3 py-2 text-sm"
            value={partOfSpeech}
            onChange={(event) => setPartOfSpeech(event.target.value)}
          >
            <option value="">{t("partOfSpeech.any")}</option>
            <option value="noun">{partOfSpeechLabel("noun", t)}</option>
            <option value="verb_tr">{partOfSpeechLabel("verb_tr", t)}</option>
            <option value="verb_intr">{partOfSpeechLabel("verb_intr", t)}</option>
            <option value="verb_intr_stative">
              {partOfSpeechLabel("verb_intr_stative", t)}
            </option>
            <option value="adjective">
              {partOfSpeechLabel("adjective", t)}
            </option>
            <option value="adverb">{partOfSpeechLabel("adverb", t)}</option>
            <option value="expression">
              {partOfSpeechLabel("expression", t)}
            </option>
            <option value="pronoun">{partOfSpeechLabel("pronoun", t)}</option>
            <option value="particle">{partOfSpeechLabel("particle", t)}</option>
            <option value="postposition">{partOfSpeechLabel("postposition", t)}</option>
            <option value="conjunction">{partOfSpeechLabel("conjunction", t)}</option>
            <option value="interjection">{partOfSpeechLabel("interjection", t)}</option>
            <option value="demonstrative">{partOfSpeechLabel("demonstrative", t)}</option>
            <option value="number">{partOfSpeechLabel("number", t)}</option>
            <option value="proper_noun">{partOfSpeechLabel("proper_noun", t)}</option>
            <option value="copula">{partOfSpeechLabel("copula", t)}</option>
            <option value="other">{partOfSpeechLabel("other", t)}</option>
          </select>
          <select
            className="rounded-md border border-brand-300 bg-surface-soft px-3 py-2 text-sm"
            value={sort}
            onChange={(event) =>
              setSort(
                event.target.value as
                  | "alphabetical"
                  | "recent"
                  | "score"
                  | "most_examples"
                  | "unseen",
              )
            }
          >
            <option value="alphabetical">
              {t("entries.sort.alphabetical")}
            </option>
            <option value="recent">{t("entries.sort.recent")}</option>
            <option value="score">{t("entries.sort.score")}</option>
            <option value="most_examples">
              {t("entries.sort.mostExamples")}
            </option>
            {allowUnseenFilter ? (
              <option value="unseen">{t("entries.sort.unseen")}</option>
            ) : null}
          </select>
        </div>
      </Card>

      <Card className={compact ? "p-3" : undefined}>
        <h3 className="text-base font-semibold text-brand-900">
          {resultTitle ?? t("entries.resultsTitle")}
        </h3>
        <div className="mt-4 space-y-3" data-testid="entry-list">
          {isPending ? (
            <p className="text-sm text-slate-600">{t("entries.loading")}</p>
          ) : null}
          {!isPending && !items.length ? (
            <p className="text-sm text-slate-600">
              {emptyMessage ?? t("entries.noMatches")}
            </p>
          ) : null}

          {items.map((entry) => {
            const normalizedGloss = normalizeComparableText(entry.gloss_pt);
            const normalizedDefinition = normalizeComparableText(
              entry.short_definition,
            );
            const shouldShowGloss =
              normalizedGloss.length > 0 &&
              normalizedGloss !== normalizedDefinition;
            const entryVote = resolveVote(
              entry.current_user_vote,
              getCachedVote(currentUser?.id, "entry", entry.id),
            );
            const isVotingEntry =
              (voteMutation.isPending || downvoteWithCommentMutation.isPending) &&
              voteTargetId === entry.id;
            const requiresComment = constraintsQuery.data?.downvote_requires_comment ?? true;
            const minDownvoteLength = constraintsQuery.data?.downvote_comment_min_length ?? 1;
            const isDownvoteOpen = Boolean(downvoteOpen[entry.id]);
            const downvoteDraft = downvoteDrafts[entry.id] ?? "";
            const downvoteError = downvoteErrors[entry.id];

            return (
              <article
                key={entry.id}
                className="rounded-md border border-brand-100 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    className="font-semibold text-brand-800 hover:underline"
                    to={`/entries/${entry.slug}`}
                    onClick={() => {
                      if (!analyticsContext) {
                        return;
                      }
                      trackEvent("entry_opened_from_list", {
                        context: analyticsContext,
                        status: entry.status,
                      });
                    }}
                  >
                    {entry.headword}
                  </Link>
                  <StatusBadge status={entry.status} />
                </div>
                {shouldShowGloss ? (
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {entry.gloss_pt}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-slate-700">
                  {entryDefinitionPreview(entry.short_definition)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-sm leading-none shadow-sm transition-colors ${
                      entryVote === 1
                        ? "border-vote-up-border bg-vote-up text-vote-up-text"
                        : "hover:border-brand-500 hover:bg-brand-50"
                    }`}
                    onClick={() => voteMutation.mutate({ entryId: entry.id, value: 1 })}
                    disabled={!canVote || isVotingEntry}
                    title={canVote ? t("entry.upvote") : t("entry.signInPrompt")}
                    aria-label={t("entry.upvote")}
                    aria-pressed={entryVote === 1}
                  >
                    <span aria-hidden>{t("entry.upvoteEmoji")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-sm leading-none shadow-sm transition-colors ${
                      entryVote === -1
                        ? "border-vote-down-border bg-vote-down text-vote-down-text"
                        : "hover:border-red-500 hover:bg-red-100"
                    }`}
                    onClick={() => {
                      if (!requiresComment) {
                        voteMutation.mutate({ entryId: entry.id, value: -1 });
                        return;
                      }
                      setDownvoteOpen((current) => ({
                        ...current,
                        [entry.id]: true,
                      }));
                      setDownvoteErrors((current) => ({ ...current, [entry.id]: "" }));
                    }}
                    disabled={!canVote || isVotingEntry}
                    title={canVote ? t("entry.downvote") : t("entry.signInPrompt")}
                    aria-label={t("entry.downvote")}
                    aria-pressed={entryVote === -1}
                  >
                    <span aria-hidden>{t("entry.downvoteEmoji")}</span>
                  </Button>
                  <span className="text-xs text-slate-600">
                    {t("entries.scoreExamples", {
                      score: entry.score_cache,
                      examples: entry.example_count_cache,
                    })}
                  </span>
                </div>
                {requiresComment && isDownvoteOpen ? (
                  <div className="mt-2 rounded-md border border-brand-100 bg-surface/70 p-2">
                    <p className="text-xs text-slate-700">{t("entries.downvoteRequiresComment")}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {t("api.downvote_comment_required", { min: minDownvoteLength })}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{t("entries.downvoteHelper")}</p>
                    <div className="mt-2">
                      <Textarea
                        rows={3}
                        value={downvoteDraft}
                        placeholder={t("entry.commentPlaceholder")}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDownvoteDrafts((current) => ({ ...current, [entry.id]: value }));
                        }}
                      />
                    </div>
                    {downvoteError ? (
                      <p className="mt-2 text-xs text-red-700">{downvoteError}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="px-3 py-1 text-xs"
                        disabled={!canVote || isVotingEntry}
                        onClick={() => {
                          const trimmed = downvoteDraft.trim();
                          if (trimmed.length < minDownvoteLength) {
                            setDownvoteErrors((current) => ({
                              ...current,
                              [entry.id]: t("api.downvote_comment_required", {
                                min: minDownvoteLength,
                              }),
                            }));
                            return;
                          }
                          downvoteWithCommentMutation.mutate({
                            entryId: entry.id,
                            body: trimmed,
                          });
                        }}
                      >
                        {t("entries.downvoteSubmit")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3 py-1 text-xs"
                        onClick={() => {
                          setDownvoteOpen((current) => ({ ...current, [entry.id]: false }));
                          setDownvoteErrors((current) => ({ ...current, [entry.id]: "" }));
                        }}
                      >
                        {t("entries.downvoteCancel")}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <p className="mt-1 text-xs text-slate-600">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <Link
                      className="text-brand-700 hover:underline"
                      to={`/profiles/${entry.proposer.id}`}
                    >
                      {entry.proposer.display_name}
                    </Link>
                    <UserBadge
                      displayName={entry.proposer.display_name}
                      badges={entry.proposer.badges}
                    />
                    <span>
                      ·{" "}
                      {t("reputation.label", {
                        score: entry.proposer.reputation_score,
                      })}
                    </span>
                  </span>
                </p>
              </article>
            );
          })}

          {isFetchingNextPage ? (
            <p className="text-sm text-slate-600">{t("entries.loadingMore")}</p>
          ) : null}
          {hasNextPage ? (
            <div ref={loadMoreRef} className="h-1 w-full" aria-hidden />
          ) : null}
        </div>
      </Card>
    </>
  );
}
