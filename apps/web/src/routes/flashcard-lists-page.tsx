import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  useCreateFlashcardList,
  useFlashcardLists,
  useVoteFlashcardList,
} from "@/features/flashcard-lists/hooks";
import { resolveFlashcardListDescription, resolveFlashcardListTitle } from "@/features/flashcard-lists/lib";
import { useI18n } from "@/i18n";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";
import { getCachedVote, resolveVote, setCachedVote, useVoteMemoryVersion } from "@/lib/vote-memory";

export function FlashcardListsPage() {
  const { t, locale } = useI18n();
  const { data: user } = useCurrentUser();
  useVoteMemoryVersion();
  const [search, setSearch] = useState("");
  const [titlePt, setTitlePt] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descPt, setDescPt] = useState("");
  const [descEn, setDescEn] = useState("");
  const [theme, setTheme] = useState("");

  const listsQuery = useFlashcardLists(
    { q: search.trim() || undefined, page: 1, page_size: 20 },
    true,
  );
  const createMutation = useCreateFlashcardList();
  const voteMutation = useVoteFlashcardList();

  const lists = listsQuery.data?.items ?? [];
  const canCreate = titlePt.trim().length >= 2;

  const appName = import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi";
  useSeo({
    title: `${t("lists.title")} | ${appName}`,
    description: t("lists.subtitle"),
    canonicalPath: "/lists",
    locale,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${t("lists.title")} | ${appName}`,
      description: t("lists.subtitle"),
      url: buildAbsoluteUrl("/lists"),
    },
  });

  const handleCreate = () => {
    if (!canCreate) return;
    createMutation.mutate(
      {
        title_pt: titlePt.trim(),
        title_en: titleEn.trim() || undefined,
        description_pt: descPt.trim() || undefined,
        description_en: descEn.trim() || undefined,
        theme_label: theme.trim() || undefined,
        is_public: true,
      },
      {
        onSuccess: () => {
          setTitlePt("");
          setTitleEn("");
          setDescPt("");
          setDescEn("");
          setTheme("");
        },
      },
    );
  };

  const countLabel = useMemo(
    () => t("lists.countLabel", { count: listsQuery.data?.total ?? 0 }),
    [listsQuery.data?.total, t],
  );

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold text-brand-900">{t("lists.title")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("lists.subtitle")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("lists.searchPlaceholder")}
            className="w-full sm:max-w-sm"
          />
          <span className="text-xs text-ink-muted">{countLabel}</span>
        </div>
      </Card>

      {user ? (
        <Card>
          <h2 className="text-lg font-semibold text-brand-900">{t("lists.createTitle")}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t("lists.createHint")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              value={titlePt}
              onChange={(event) => setTitlePt(event.target.value)}
              placeholder={t("lists.titlePtPlaceholder")}
            />
            <Input
              value={titleEn}
              onChange={(event) => setTitleEn(event.target.value)}
              placeholder={t("lists.titleEnPlaceholder")}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Textarea
              rows={3}
              value={descPt}
              onChange={(event) => setDescPt(event.target.value)}
              placeholder={t("lists.descPtPlaceholder")}
            />
            <Textarea
              rows={3}
              value={descEn}
              onChange={(event) => setDescEn(event.target.value)}
              placeholder={t("lists.descEnPlaceholder")}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              placeholder={t("lists.themePlaceholder")}
              className="sm:max-w-xs"
            />
            <Button
              type="button"
              disabled={!canCreate || createMutation.isPending}
              onClick={handleCreate}
            >
              {t("lists.createCta")}
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-ink-muted">{t("lists.signInToCreate")}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {listsQuery.isLoading ? (
          <Card>
            <p className="text-sm text-ink-muted">{t("lists.loading")}</p>
          </Card>
        ) : lists.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-muted">{t("lists.empty")}</p>
          </Card>
        ) : (
          lists.map((list) => {
            const title = resolveFlashcardListTitle(list, locale);
            const description = resolveFlashcardListDescription(list, locale);
            const voteValue = resolveVote(
              list.current_user_vote,
              getCachedVote(user?.id, "list", list.id),
            );
            return (
              <Card key={list.id} className="flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/lists/${list.id}`} className="text-lg font-semibold text-brand-900 hover:underline">
                      {title}
                    </Link>
                    {list.theme_label ? (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
                        {list.theme_label}
                      </span>
                    ) : null}
                  </div>
                  {description ? (
                    <p className="mt-2 text-sm text-ink-muted">{description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-ink-muted">
                    {t("lists.meta", {
                      count: list.item_count_cache,
                      score: list.score_cache,
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-sm leading-none shadow-sm transition-colors ${
                      voteValue === 1
                        ? "border-vote-up-border bg-vote-up text-vote-up-text"
                        : "hover:border-brand-500 hover:bg-brand-50"
                    }`}
                    onClick={() => {
                      if (!user) return;
                      voteMutation.mutate({ listId: list.id, payload: { value: 1 } });
                      setCachedVote(user.id, "list", list.id, 1);
                    }}
                    disabled={!user || voteMutation.isPending}
                    title={user ? t("lists.upvote") : t("lists.signInPrompt")}
                    aria-label={t("lists.upvote")}
                    aria-pressed={voteValue === 1}
                  >
                    <span aria-hidden>+</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-sm leading-none shadow-sm transition-colors ${
                      voteValue === -1
                        ? "border-vote-down-border bg-vote-down text-vote-down-text"
                        : "hover:border-red-500 hover:bg-red-100"
                    }`}
                    onClick={() => {
                      if (!user) return;
                      voteMutation.mutate({ listId: list.id, payload: { value: -1 } });
                      setCachedVote(user.id, "list", list.id, -1);
                    }}
                    disabled={!user || voteMutation.isPending}
                    title={user ? t("lists.downvote") : t("lists.signInPrompt")}
                    aria-label={t("lists.downvote")}
                    aria-pressed={voteValue === -1}
                  >
                    <span aria-hidden>-</span>
                  </Button>
                  <Link
                    to={`/games/flashcards?list_id=${list.id}`}
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    {t("lists.studyCta")}
                  </Link>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
