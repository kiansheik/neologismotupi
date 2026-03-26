import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { EntryBrowser } from "@/components/entry-browser";
import { Card } from "@/components/ui/card";
import { UserBadge } from "@/components/user-badge";
import { getPublicUser } from "@/features/auth/api";
import {
  formatDate,
  formatRelativeOrDate,
  formatTimeSince,
} from "@/i18n/formatters";
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
                    className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-2 py-1 text-xs text-brand-800 hover:bg-brand-50 hover:underline"
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
              {t("profile.totalComments")}
            </p>
            <p className="text-base font-semibold text-brand-900">
              {stats?.total_comments ?? 0}
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
    </section>
  );
}
