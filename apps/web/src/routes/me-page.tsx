import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
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
import { useI18n } from "@/i18n";
import { formatRelativeOrDate } from "@/i18n/formatters";
import { ApiError } from "@/lib/api";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";

export function MePage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const { data: currentUser } = useCurrentUser();

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
