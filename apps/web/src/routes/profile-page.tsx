import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { EntryBrowser } from "@/components/entry-browser";
import { Card } from "@/components/ui/card";
import { UserBadge } from "@/components/user-badge";
import { Button } from "@/components/ui/button";
import { getPublicUser } from "@/features/auth/api";
import { listUserAudioSubmissions } from "@/features/audio/api";
import { CompactAudioPlayer } from "@/features/audio/components";
import { formatDate, formatRelativeOrDate, formatTimeSince } from "@/i18n/formatters";
import { useI18n } from "@/i18n";
import { buildProfileLinks } from "@/lib/profile-links";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";
import {
  badgeEmoji,
  badgeLabelKey,
  resolveUserBadges,
} from "@/lib/user-badges";

export function ProfilePage() {
  const { t, locale } = useI18n();
  const { userId } = useParams();

  const userQuery = useQuery({
    queryKey: ["public-user", userId],
    queryFn: () => getPublicUser(String(userId)),
    enabled: Boolean(userId),
  });

  const audioQuery = useInfiniteQuery({
    queryKey: ["profile-audio", userId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listUserAudioSubmissions(String(userId), { page: Number(pageParam), page_size: 10 }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((total, page) => total + page.items.length, 0);
      return loadedCount < lastPage.total ? lastPage.page + 1 : undefined;
    },
    enabled: Boolean(userId),
  });
  const audioItems = useMemo(
    () => audioQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [audioQuery.data],
  );

  const seoProfile = userQuery.data?.profile;
  useSeo({
    title: seoProfile
      ? `${seoProfile.display_name} | ${import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi"}`
      : `${t("profile.loading")} | ${import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi"}`,
    description: seoProfile
      ? `Perfil da comunidade Tupi de ${seoProfile.display_name} com verbetes publicados, comentários e atividade recente.`
      : "Perfil da comunidade de Tupi.",
    canonicalPath: userId ? `/profiles/${userId}` : "/",
    locale,
    structuredData: seoProfile
      ? {
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          url: buildAbsoluteUrl(`/profiles/${userId}`),
          mainEntity: {
            "@type": "Person",
            name: seoProfile.display_name,
            description: seoProfile.bio ?? undefined,
          },
        }
      : null,
    disabled: !userId,
  });

  if (!userId) {
    return <p className="text-sm text-red-700">{t("profile.invalidUrl")}</p>;
  }

  if (userQuery.isLoading) {
    return <p className="text-sm text-slate-700">{t("profile.loading")}</p>;
  }

  if (userQuery.error || !userQuery.data) {
    return <p className="text-sm text-red-700">{t("profile.loadError")}</p>;
  }

  const profile = userQuery.data.profile;
  const profileBadges = resolveUserBadges(profile.display_name, profile.badges);
  const stats = profile.stats;
  const profileLinks = buildProfileLinks(profile);

  return (
    <section className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-brand-900">
            {profile.display_name}
          </h1>
          <UserBadge
            displayName={profile.display_name}
            badges={profile.badges}
          />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {t("reputation.label", { score: profile.reputation_score })}
        </p>
        {profileBadges.length ? (
          <div className="mt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("profile.badgesTitle")}
            </p>
            <ul className="mt-1 flex flex-wrap items-center gap-2">
              {profileBadges.map((badge) => (
                <li
                  key={badge}
                  className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-xs text-brand-900"
                >
                  <span aria-hidden>{badgeEmoji(badge)}</span>
                  <span>{t(badgeLabelKey(badge))}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {profile.role_label ? (
          <p className="mt-1 text-sm text-slate-700">{profile.role_label}</p>
        ) : null}
        {profile.affiliation_label ? (
          <p className="text-sm text-slate-700">{profile.affiliation_label}</p>
        ) : null}
        {profile.bio ? (
          <p className="mt-2 text-sm text-slate-700">{profile.bio}</p>
        ) : null}
        {profileLinks.length ? (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("profile.linksTitle")}
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {profileLinks.map((link) => (
                <li key={link.key}>
                  <a
                    className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-surface-soft px-2 py-1 text-xs text-brand-800 hover:bg-brand-50 hover:underline"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="font-medium">{t(link.labelKey)}:</span>
                    <span>{link.display}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-brand-100 bg-brand-50/30 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("profile.totalEntries")}
            </p>
            <p className="text-base font-semibold text-brand-900">
              {stats?.total_entries ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-brand-100 bg-brand-50/30 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("profile.totalEntryVotes")}
            </p>
            <p className="text-base font-semibold text-brand-900">
              {stats?.total_entry_votes ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-brand-100 bg-brand-50/30 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("profile.totalComments")}
            </p>
            <p className="text-base font-semibold text-brand-900">
              {stats?.total_comments ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-brand-100 bg-brand-50/30 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("profile.totalAudio")}
            </p>
            <p className="text-base font-semibold text-brand-900">
              {stats?.total_audio ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-brand-100 bg-brand-50/30 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("profile.lastActive")}
            </p>
            <p className="text-sm text-slate-700">
              {stats?.last_active_at
                ? formatRelativeOrDate(stats.last_active_at, locale)
                : t("profile.notAvailable")}
            </p>
          </div>
          <div className="rounded-md border border-brand-100 bg-brand-50/30 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("profile.lastSeen")}
            </p>
            <p className="text-sm text-slate-700">
              {stats?.last_seen_at
                ? formatRelativeOrDate(stats.last_seen_at, locale)
                : t("profile.notAvailable")}
            </p>
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-medium text-slate-900">
            {t("profile.submittingSince")}:
          </span>{" "}
          {stats?.submitting_since_at
            ? `${formatTimeSince(stats.submitting_since_at, locale)} (${formatDate(stats.submitting_since_at, locale)})`
            : t("profile.notAvailable")}
        </p>
      </Card>

      <EntryBrowser
        compact
        queryKey={`profile-${userId}`}
        title={t("profile.submissionsTitle")}
        emptyMessage={t("profile.noSubmissions")}
        scope={{ proposer_user_id: userId }}
      />

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("profile.audioTitle")}</h2>
        <div className="mt-3 space-y-3">
          {audioQuery.isLoading ? (
            <p className="text-sm text-slate-600">{t("profile.audioLoading")}</p>
          ) : audioQuery.isError ? (
            <p className="text-sm text-red-700">{t("profile.audioLoadError")}</p>
          ) : audioItems.length ? (
            audioItems.map((submission) => (
              <article key={submission.id} className="rounded-md border border-brand-100 p-3">
                <CompactAudioPlayer src={submission.url} t={t} size="sm" />
                <p className="mt-2 text-sm text-slate-700">
                  {submission.entry_slug ? (
                    <Link className="text-brand-700 hover:underline" to={`/entries/${submission.entry_slug}`}>
                      {submission.entry_headword ?? t("profile.audioEntryFallback")}
                    </Link>
                  ) : (
                    <span>{t("profile.audioEntryFallback")}</span>
                  )}
                </p>
                {submission.example_sentence_original ? (
                  <p className="mt-1 text-xs text-slate-600">
                    {t("profile.audioExampleLabel")}: {submission.example_sentence_original}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  {t("audio.uploadedAt", { date: formatRelativeOrDate(submission.created_at, locale) })}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">{t("profile.audioEmpty")}</p>
          )}
        </div>
        {audioQuery.hasNextPage ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => audioQuery.fetchNextPage()}
              disabled={audioQuery.isFetchingNextPage}
            >
              {audioQuery.isFetchingNextPage ? t("profile.audioLoadingMore") : t("profile.audioLoadMore")}
            </Button>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
