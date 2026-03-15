import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { UserBadge } from "@/components/user-badge";
import { useCurrentUser } from "@/features/auth/hooks";
import { listEntries } from "@/features/entries/api";
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

export function MePage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const { data: currentUser } = useCurrentUser();
  const [profileForm, setProfileForm] = useState({
    display_name: "",
    bio: "",
    website_url: "",
    instagram_handle: "",
    tiktok_handle: "",
    youtube_handle: "",
    bluesky_handle: "",
    affiliation_label: "",
    role_label: "",
  });

  const { data } = useQuery({
    queryKey: ["my-entries"],
    queryFn: () => listEntries({ page: 1, page_size: 50, mine: true, sort: "recent" }),
    enabled: Boolean(currentUser),
  });

  const notificationPreferencesQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
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
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
  });

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
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

  const updateProfileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      if (currentUser?.id) {
        await queryClient.invalidateQueries({ queryKey: ["public-user", currentUser.id] });
        await queryClient.invalidateQueries({ queryKey: ["user-entries", currentUser.id] });
      }
    },
  });

  const prefValue = notificationPreferencesQuery.data;
  const unreadCount = notificationsQuery.data?.unread_count ?? 0;
  const notifications = notificationsQuery.data?.items ?? [];

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
    if (!currentUser?.profile) {
      return;
    }
    setProfileForm({
      display_name: currentUser.profile.display_name ?? "",
      bio: currentUser.profile.bio ?? "",
      website_url: currentUser.profile.website_url ?? "",
      instagram_handle: currentUser.profile.instagram_handle ?? "",
      tiktok_handle: currentUser.profile.tiktok_handle ?? "",
      youtube_handle: currentUser.profile.youtube_handle ?? "",
      bluesky_handle: currentUser.profile.bluesky_handle ?? "",
      affiliation_label: currentUser.profile.affiliation_label ?? "",
      role_label: currentUser.profile.role_label ?? "",
    });
  }, [currentUser]);

  if (!currentUser) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("me.title")}</h1>
        <p className="mt-2 text-sm text-slate-700">{t("me.signInPrompt")}</p>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("me.title")}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>{currentUser.profile?.display_name ?? t("me.fallbackUser")}</span>
          <UserBadge
            displayName={currentUser.profile?.display_name}
            badges={currentUser.profile?.badges}
          />
          <span>· {currentUser.email}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {t("reputation.label", { score: currentUser.profile?.reputation_score ?? 0 })}
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("me.profileFormTitle")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("me.profileFormHelp")}</p>
        <p className="mt-1 text-xs text-slate-600">{t("form.requiredLegend")}</p>
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
              <span className="text-sm font-medium text-slate-700">{t("me.profile.displayName")} *</span>
              <Input
                value={profileForm.display_name}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, display_name: event.target.value }))
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
                  setProfileForm((current) => ({ ...current, website_url: event.target.value }))
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
                  setProfileForm((current) => ({ ...current, instagram_handle: event.target.value }))
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
                  setProfileForm((current) => ({ ...current, tiktok_handle: event.target.value }))
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
                  setProfileForm((current) => ({ ...current, youtube_handle: event.target.value }))
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
                  setProfileForm((current) => ({ ...current, bluesky_handle: event.target.value }))
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
                  setProfileForm((current) => ({ ...current, affiliation_label: event.target.value }))
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
                  setProfileForm((current) => ({ ...current, role_label: event.target.value }))
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
                setProfileForm((current) => ({ ...current, bio: event.target.value }))
              }
              maxLength={500}
              rows={4}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={updateProfileMutation.isPending}>
              {t("me.profile.save")}
            </Button>
            {updateProfileMutation.isSuccess ? (
              <p className="text-sm text-green-700">{t("me.profile.saved")}</p>
            ) : null}
            {updateProfileMutation.error instanceof ApiError ? (
              <p className="text-sm text-red-700">
                {getLocalizedApiErrorMessage(updateProfileMutation.error, t)}
              </p>
            ) : null}
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("me.submissionsTitle")}</h2>
        <div className="mt-3 space-y-2">
          {data?.items.length ? (
            data.items.map((entry) => (
              <article key={entry.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link className="text-brand-800 hover:underline" to={`/entries/${entry.slug}`}>
                    {entry.headword}
                  </Link>
                  <StatusBadge status={entry.status} />
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">{t("me.noSubmissions")}</p>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-brand-900">{t("me.notificationsTitle")}</h2>
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
                  <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                  {!notification.is_read ? <Badge tone="pending">{t("me.notificationNew")}</Badge> : null}
                </div>
                {notification.body ? (
                  <p className="mt-1 text-sm text-slate-700">{notification.body}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-600">
                  {formatRelativeOrDate(notification.created_at, locale)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {notification.entry_url ? (
                    <Link className="text-sm text-brand-700 hover:underline" to={notification.entry_url}>
                      {notification.entry_headword ?? notification.entry_url}
                    </Link>
                  ) : null}
                  {notification.actor_profile_url && notification.actor_display_name ? (
                    <Link className="text-sm text-brand-700 hover:underline" to={notification.actor_profile_url}>
                      {notification.actor_display_name}
                    </Link>
                  ) : null}
                  {!notification.is_read ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2 py-1"
                      onClick={() => markNotificationReadMutation.mutate(notification.id)}
                      disabled={markNotificationReadMutation.isPending}
                    >
                      {t("me.markRead")}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">{t("me.notificationsNone")}</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("me.notificationPrefsTitle")}</h2>
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
            const value = prefValue ? Boolean(prefValue[item.key as keyof typeof prefValue]) : true;
            return (
              <label
                key={item.key}
                className="flex items-center justify-between rounded-md border border-brand-100 bg-[#fffaf2] px-3 py-2 text-sm"
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
          <p className="mt-2 text-sm text-green-700">{t("me.notificationPrefsSaved")}</p>
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
