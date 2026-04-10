import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  useCreateFlashcardListComment,
  useFlashcardListComments,
  useFlashcardListDetail,
  useVoteFlashcardList,
} from "@/features/flashcard-lists/hooks";
import { resolveFlashcardListDescription, resolveFlashcardListTitle } from "@/features/flashcard-lists/lib";
import { useI18n } from "@/i18n";
import { formatRelativeOrDate } from "@/i18n/formatters";
import { entryDefinitionPreview } from "@/lib/entry-definition";
import { useOrthography } from "@/lib/orthography";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";
import { getCachedVote, resolveVote, setCachedVote, useVoteMemoryVersion } from "@/lib/vote-memory";

export function FlashcardListDetailPage() {
  const { t, locale } = useI18n();
  const { listId } = useParams<{ listId: string }>();
  const { data: user } = useCurrentUser();
  const { apply } = useOrthography();
  useVoteMemoryVersion();
  const [commentBody, setCommentBody] = useState("");

  const listQuery = useFlashcardListDetail(listId ?? null, Boolean(listId));
  const commentsQuery = useFlashcardListComments(listId ?? null, { page: 1, page_size: 50 });
  const voteMutation = useVoteFlashcardList();
  const createCommentMutation = useCreateFlashcardListComment();

  const list = listQuery.data?.list;
  const entries = listQuery.data?.items ?? [];
  const comments = commentsQuery.data?.items ?? [];

  const title = useMemo(() => (list ? resolveFlashcardListTitle(list, locale) : ""), [list, locale]);
  const description = useMemo(
    () => (list ? resolveFlashcardListDescription(list, locale) : null),
    [list, locale],
  );
  const voteValue = resolveVote(list?.current_user_vote, getCachedVote(user?.id, "list", list?.id ?? ""));

  const appName = import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi";
  useSeo({
    title: list ? `${title} | ${appName}` : `${t("lists.title")} | ${appName}`,
    description: description ?? t("lists.subtitle"),
    canonicalPath: listId ? `/lists/${listId}` : "/lists",
    locale,
    structuredData: list
      ? {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${title} | ${appName}`,
          description: description ?? undefined,
          url: buildAbsoluteUrl(`/lists/${listId}`),
        }
      : null,
  });

  if (listQuery.isLoading) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{t("lists.loading")}</p>
      </Card>
    );
  }

  if (!list) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{t("lists.notFound")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand-900">{title}</h1>
            {list.theme_label ? (
              <p className="mt-1 text-xs text-brand-700">{list.theme_label}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
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
        </div>
        {description ? (
          <p className="mt-3 text-sm text-ink-muted">{description}</p>
        ) : null}
        <p className="mt-2 text-xs text-ink-muted">
          {t("lists.meta", { count: list.item_count_cache, score: list.score_cache })}
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("lists.entriesTitle")}</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{t("lists.entriesEmpty")}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-line-soft p-3">
                <Link
                  to={`/entries/${entry.slug}`}
                  className="text-base font-semibold text-brand-900 hover:underline"
                >
                  {apply(entry.headword)}
                </Link>
                <p className="mt-1 text-sm text-ink-muted">{entry.gloss_pt}</p>
                <p className="mt-1 text-sm text-ink">
                  {entryDefinitionPreview(entry.short_definition)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("lists.commentsTitle")}</h2>
        {commentsQuery.isLoading ? (
          <p className="mt-2 text-sm text-ink-muted">{t("lists.commentsLoading")}</p>
        ) : comments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{t("lists.commentsEmpty")}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-md border border-line-soft p-3">
                <p className="text-xs text-ink-muted">
                  {comment.author.display_name} ·{" "}
                  {formatRelativeOrDate(comment.created_at, locale)}
                </p>
                <p className="mt-2 text-sm text-ink">{comment.body}</p>
              </div>
            ))}
          </div>
        )}
        {user ? (
          <div className="mt-4">
            <Textarea
              rows={3}
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder={t("lists.commentPlaceholder")}
            />
            <Button
              type="button"
              className="mt-2"
              disabled={commentBody.trim().length < 2 || createCommentMutation.isPending}
              onClick={() => {
                const trimmed = commentBody.trim();
                if (!trimmed) return;
                createCommentMutation.mutate(
                  { listId: list.id, payload: { body: trimmed } },
                  {
                    onSuccess: () => {
                      setCommentBody("");
                      commentsQuery.refetch();
                    },
                  },
                );
              }}
            >
              {t("lists.commentSubmit")}
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-muted">{t("lists.signInToComment")}</p>
        )}
      </Card>
    </div>
  );
}
