import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EntryBrowser } from "@/components/entry-browser";
import { OrthographyMappingCard } from "@/components/orthography-mapping-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { UserBadge } from "@/components/user-badge";
import { getPublicUser } from "@/features/auth/api";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  listMyNewsletters,
  NEWSLETTER_WORD_OF_DAY,
  updateMyNewsletter,
} from "@/features/newsletters/api";
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from "@/features/notifications/api";
import { updateMyProfile } from "@/features/users/api";
import { useI18n } from "@/i18n";
import { formatRelativeOrDate } from "@/i18n/formatters";
import { ApiError } from "@/lib/api";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { useOrthography } from "@/lib/orthography";
import { buildProfileLinks } from "@/lib/profile-links";
import type { User } from "@/lib/types";

function profileToForm(profile: User["profile"]) {
  return {
    display_name: profile?.display_name ?? "",
    bio: profile?.bio ?? "",
    website_url: profile?.website_url ?? "",
    instagram_handle: profile?.instagram_handle ?? "",
    tiktok_handle: profile?.tiktok_handle ?? "",
    youtube_handle: profile?.youtube_handle ?? "",
    bluesky_handle: profile?.bluesky_handle ?? "",
    affiliation_label: profile?.affiliation_label ?? "",
    role_label: profile?.role_label ?? "",
  };
}

export function MePage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const { data: currentUser } = useCurrentUser();
  const { apply } = useOrthography();
  const [profileForm, setProfileForm] = useState(profileToForm(null));
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const notificationPreferencesQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
    enabled: Boolean(currentUser),
  });

  const newslettersQuery = useQuery({
    queryKey: ["newsletter-subscriptions"],
    queryFn: listMyNewsletters,
    enabled: Boolean(currentUser),
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications({ page: 1, page_size: 20 }),
    enabled: Boolean(currentUser),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["notification-preferences"],
      });
    },
  });

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(notificationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const updateNewsletterMutation = useMutation({
    mutationFn: ({
      newsletterKey,
      updates,
    }: {
      newsletterKey: string;
      updates: { is_active?: boolean };
    }) => updateMyNewsletter(newsletterKey, updates),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["newsletter-subscriptions"],
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: async (updatedProfile) => {
      queryClient.setQueryData<User | undefined>(["me"], (previous) =>
        previous ? { ...previous, profile: updatedProfile } : previous,
      );
      setProfileForm(profileToForm(updatedProfile));
      setIsEditingProfile(false);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      if (currentUser?.id) {
        await queryClient.invalidateQueries({
          queryKey: ["public-user", currentUser.id],
        });
        await queryClient.invalidateQueries({
          queryKey: ["user-entries", currentUser.id],
        });
      }
    },
  });

  const prefValue = notificationPreferencesQuery.data;
  const newsletterSubscriptions = newslettersQuery.data ?? [];
  const wordOfDaySubscription = newsletterSubscriptions.find(
    (item) => item.newsletter_key === NEWSLETTER_WORD_OF_DAY,
  );
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;
  const notifications = notificationsQuery.data?.items ?? [];
  const profileLinks = useMemo(
    () => (currentUser?.profile ? buildProfileLinks(currentUser.profile) : []),
    [currentUser?.profile],
  );

  const publicProfileQuery = useQuery({
    queryKey: ["public-user", currentUser?.id],
    queryFn: () => getPublicUser(String(currentUser?.id)),
    enabled: Boolean(currentUser?.id),
  });
  const publicStats = publicProfileQuery.data?.profile.stats;

  const preferenceRows = useMemo(
    () => [
      { key: "in_app_enabled", label: t("me.pref.inApp") },
      { key: "email_enabled", label: t("me.pref.email") },
      { key: "push_enabled", label: t("me.pref.push") },
      { key: "notify_on_entry_comments", label: t("me.pref.comments") },
      { key: "notify_on_mentions", label: t("me.pref.mentions") },
    ],
    [t],
  );

  const setAllPreferences = (enabled: boolean) => {
    updatePreferencesMutation.mutate({
      in_app_enabled: enabled,
      email_enabled: enabled,
      push_enabled: enabled,
      notify_on_entry_comments: enabled,
      notify_on_mentions: enabled,
    });
  };

  useEffect(() => {
    setProfileForm(profileToForm(currentUser?.profile ?? null));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">
          {t("me.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-700">{t("me.signInPrompt")}</p>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">
          {t("me.title")}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>
            {currentUser.profile?.display_name ?? t("me.fallbackUser")}
          </span>
          <UserBadge
            displayName={currentUser.profile?.display_name}
            badges={currentUser.profile?.badges}
          />
          <span>· {currentUser.email}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {t("reputation.label", {
            score: currentUser.profile?.reputation_score ?? 0,
          })}
        </p>
        {publicStats ? (
          <p className="mt-1 text-sm text-slate-600">
            {t("profile.totalEntryVotes")}: {publicStats.total_entry_votes ?? 0} ·{" "}
            {t("profile.totalEntries")}: {publicStats.total_entries ?? 0}
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">
              {t("me.profilePreviewTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t("me.profilePreviewHelp")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="text-sm text-brand-700 hover:underline"
              to={`/profiles/${currentUser.id}`}
            >
              {t("me.profile.viewPublic")}
            </Link>
            <Button
              type="button"
              variant={isEditingProfile ? "secondary" : "primary"}
              onClick={() => {
                if (isEditingProfile) {
                  setProfileForm(profileToForm(currentUser.profile));
                }
                setIsEditingProfile((current) => !current);
              }}
            >
              {isEditingProfile ? t("me.profile.cancel") : t("me.profile.edit")}
            </Button>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-brand-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-brand-900">
              {currentUser.profile?.display_name ?? t("me.fallbackUser")}
            </p>
            <UserBadge
              displayName={currentUser.profile?.display_name}
              badges={currentUser.profile?.badges}
            />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {t("reputation.label", {
              score: currentUser.profile?.reputation_score ?? 0,
            })}
          </p>
          {currentUser.profile?.role_label ? (
            <p className="mt-1 text-sm text-slate-700">
              {currentUser.profile.role_label}
            </p>
          ) : null}
          {currentUser.profile?.affiliation_label ? (
            <p className="text-sm text-slate-700">
              {currentUser.profile.affiliation_label}
            </p>
          ) : null}
          {currentUser.profile?.bio ? (
            <p className="mt-2 text-sm text-slate-700">
              {currentUser.profile.bio}
            </p>
          ) : null}
          {profileLinks.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
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
          ) : null}
        </div>
      </Card>

      {isEditingProfile ? (
        <Card>
          <h2 className="text-lg font-semibold text-brand-900">
            {t("me.profileFormTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("me.profileFormHelp")}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {t("form.requiredLegend")}
          </p>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              updateProfileMutation.mutate({
                display_name: profileForm.display_name,
                bio: profileForm.bio.trim() || null,
                website_url: profileForm.website_url.trim() || null,
                instagram_handle: profileForm.instagram_handle.trim() || null,
                tiktok_handle: profileForm.tiktok_handle.trim() || null,
                youtube_handle: profileForm.youtube_handle.trim() || null,
                bluesky_handle: profileForm.bluesky_handle.trim() || null,
                affiliation_label: profileForm.affiliation_label.trim() || null,
                role_label: profileForm.role_label.trim() || null,
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {t("me.profile.displayName")} *
                </span>
                <Input
                  value={profileForm.display_name}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      display_name: event.target.value,
                    }))
                  }
                  maxLength={120}
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {t("me.profile.website")} ({t("form.optional")})
                </span>
                <Input
                  value={profileForm.website_url}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      website_url: event.target.value,
                    }))
                  }
                  maxLength={500}
                  placeholder="https://..."
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {t("me.profile.instagram")} ({t("form.optional")})
                </span>
                <Input
                  value={profileForm.instagram_handle}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      instagram_handle: event.target.value,
                    }))
                  }
                  maxLength={120}
                  placeholder="@usuario"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {t("me.profile.tiktok")} ({t("form.optional")})
                </span>
                <Input
                  value={profileForm.tiktok_handle}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      tiktok_handle: event.target.value,
                    }))
                  }
                  maxLength={120}
                  placeholder="@usuario"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {t("me.profile.youtube")} ({t("form.optional")})
                </span>
                <Input
                  value={profileForm.youtube_handle}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      youtube_handle: event.target.value,
                    }))
                  }
                  maxLength={120}
                  placeholder="@canal"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {t("me.profile.bluesky")} ({t("form.optional")})
                </span>
                <Input
                  value={profileForm.bluesky_handle}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      bluesky_handle: event.target.value,
                    }))
                  }
                  maxLength={253}
                  placeholder="usuario.bsky.social"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {t("me.profile.affiliation")} ({t("form.optional")})
                </span>
                <Input
                  value={profileForm.affiliation_label}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      affiliation_label: event.target.value,
                    }))
                  }
                  maxLength={120}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">
                  {t("me.profile.role")} ({t("form.optional")})
                </span>
                <Input
                  value={profileForm.role_label}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      role_label: event.target.value,
                    }))
                  }
                  maxLength={120}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">
                {t("me.profile.bio")} ({t("form.optional")})
              </span>
              <Textarea
                value={profileForm.bio}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    bio: event.target.value,
                  }))
                }
                maxLength={500}
                rows={4}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={updateProfileMutation.isPending}>
                {t("me.profile.save")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setProfileForm(profileToForm(currentUser.profile));
                  setIsEditingProfile(false);
                }}
              >
                {t("me.profile.cancel")}
              </Button>
              {updateProfileMutation.isSuccess ? (
                <p className="text-sm text-green-700">
                  {t("me.profile.saved")}
                </p>
              ) : null}
              {updateProfileMutation.error instanceof ApiError ? (
                <p className="text-sm text-red-700">
                  {getLocalizedApiErrorMessage(updateProfileMutation.error, t)}
                </p>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      <OrthographyMappingCard />

      <EntryBrowser
        compact
        queryKey={`me-${currentUser.id}`}
        title={t("me.submissionsTitle")}
        emptyMessage={t("me.noSubmissions")}
        scope={{ proposer_user_id: currentUser.id }}
      />

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">
          {t("me.newslettersTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {t("me.newslettersDescription")}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t("me.newslettersLocaleNote")}
        </p>
        {newslettersQuery.isLoading ? (
          <p className="mt-3 text-sm text-slate-600">
            {t("me.newslettersLoading")}
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="flex items-start justify-between gap-4 rounded-md border border-brand-100 bg-surface-input px-3 py-2 text-sm">
              <span>
                <span className="block font-medium text-slate-900">
                  {t("me.newsletterWordOfDay")}
                </span>
                <span className="mt-1 block text-xs text-slate-600">
                  {t("me.newsletterWordOfDayHelp")}
                </span>
              </span>
              <input
                type="checkbox"
                checked={wordOfDaySubscription?.is_active ?? true}
                onChange={(event) =>
                  updateNewsletterMutation.mutate({
                    newsletterKey: NEWSLETTER_WORD_OF_DAY,
                    updates: { is_active: event.target.checked },
                  })
                }
                disabled={updateNewsletterMutation.isPending}
              />
            </label>
          </div>
        )}
        {updateNewsletterMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">
            {t("me.newslettersSaved")}
          </p>
        ) : null}
        {updateNewsletterMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(updateNewsletterMutation.error, t)}
          </p>
        ) : null}
        {newslettersQuery.error ? (
          <p className="mt-2 text-sm text-red-700">{t("api.request_failed")}</p>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-brand-900">
            {t("me.notificationsTitle")}
          </h2>
          <div className="flex items-center gap-2">
            <Badge tone={unreadCount > 0 ? "pending" : "neutral"}>
              {t("me.notificationsUnread", { count: unreadCount })}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending || unreadCount === 0}
            >
              {t("me.markAllRead")}
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {notifications.length ? (
            notifications.map((notification) => (
              <article
                key={notification.id}
                className="rounded-md border border-brand-100 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {notification.title}
                  </p>
                  {!notification.is_read ? (
                    <Badge tone="pending">{t("me.notificationNew")}</Badge>
                  ) : null}
                </div>
                {notification.body ? (
                  <p className="mt-1 text-sm text-slate-700">
                    {notification.body}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-600">
                  {formatRelativeOrDate(notification.created_at, locale)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {notification.entry_url ? (
                    <Link
                      className="text-sm text-brand-700 hover:underline"
                      to={notification.entry_url}
                    >
                      {notification.entry_headword
                        ? apply(notification.entry_headword)
                        : notification.entry_url}
                    </Link>
                  ) : null}
                  {notification.actor_profile_url &&
                  notification.actor_display_name ? (
                    <Link
                      className="text-sm text-brand-700 hover:underline"
                      to={notification.actor_profile_url}
                    >
                      {notification.actor_display_name}
                    </Link>
                  ) : null}
                  {!notification.is_read ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2 py-1"
                      onClick={() =>
                        markNotificationReadMutation.mutate(notification.id)
                      }
                      disabled={markNotificationReadMutation.isPending}
                    >
                      {t("me.markRead")}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              {t("me.notificationsNone")}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">
          {t("me.notificationPrefsTitle")}
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAllPreferences(true)}
            disabled={updatePreferencesMutation.isPending}
          >
            {t("me.pref.allOn")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAllPreferences(false)}
            disabled={updatePreferencesMutation.isPending}
          >
            {t("me.pref.allOff")}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {preferenceRows.map((item) => {
            const value = prefValue
              ? Boolean(prefValue[item.key as keyof typeof prefValue])
              : true;
            return (
              <label
                key={item.key}
                className="flex items-center justify-between rounded-md border border-brand-100 bg-surface-input px-3 py-2 text-sm"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(event) =>
                    updatePreferencesMutation.mutate({
                      [item.key]: event.target.checked,
                    })
                  }
                  disabled={updatePreferencesMutation.isPending}
                />
              </label>
            );
          })}
        </div>
        {updatePreferencesMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">
            {t("me.notificationPrefsSaved")}
          </p>
        ) : null}
        {updatePreferencesMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(updatePreferencesMutation.error, t)}
          </p>
        ) : null}
        {notificationPreferencesQuery.error ? (
          <p className="mt-2 text-sm text-red-700">{t("api.request_failed")}</p>
        ) : null}
      </Card>
    </section>
  );
}
