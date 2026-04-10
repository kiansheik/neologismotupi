import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/api";
import { useI18n } from "@/i18n";
import { formatRelativeOrDate } from "@/i18n/formatters";
import { ApiError } from "@/lib/api";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { useOrthography } from "@/lib/orthography";

export function NotificationsPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { apply } = useOrthography();
  const [showAll, setShowAll] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", { showAll }],
    queryFn: () =>
      listNotifications({
        page: 1,
        page_size: 30,
        unread_only: !showAll,
      }),
    enabled: Boolean(user),
  });

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
  });

  if (userLoading) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{t("notifications.loading")}</p>
      </Card>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Card>
          <h1 className="text-2xl font-semibold text-brand-900">{t("notifications.title")}</h1>
          <p className="mt-2 text-sm text-ink-muted">{t("notifications.subtitle")}</p>
        </Card>
        <Card>
          <p className="text-lg font-semibold text-brand-900">{t("notifications.signInTitle")}</p>
          <p className="mt-2 text-sm text-ink-muted">{t("notifications.signInBody")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/login"
              className="inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-strong"
            >
              {t("notifications.signInCtaLogin")}
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center rounded-md bg-surface-input px-4 py-2 text-sm font-medium text-brand-800 ring-1 ring-line-strong transition-colors hover:bg-surface-hover"
            >
              {t("notifications.signInCtaSignup")}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const unreadCount = notificationsQuery.data?.unread_count ?? 0;
  const notifications = notificationsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand-900">{t("notifications.title")}</h1>
            <p className="mt-2 text-sm text-ink-muted">{t("notifications.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={unreadCount > 0 ? "pending" : "neutral"}>
              {t("notifications.unread", { count: unreadCount })}
            </Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending || unreadCount === 0}
            >
              {t("notifications.markAllRead")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="px-2 py-1"
              onClick={() => setShowAll((prev) => !prev)}
            >
              {showAll ? t("notifications.showUnread") : t("notifications.showAll")}
            </Button>
          </div>
        </div>
        {markAllReadMutation.error instanceof ApiError ? (
          <p className="mt-3 text-sm text-red-700">
            {getLocalizedApiErrorMessage(markAllReadMutation.error, t)}
          </p>
        ) : null}
      </Card>

      <Card>
        {notificationsQuery.isLoading ? (
          <p className="text-sm text-ink-muted">{t("notifications.loading")}</p>
        ) : notificationsQuery.error ? (
          <p className="text-sm text-red-700">{t("api.request_failed")}</p>
        ) : notifications.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-muted">
              {showAll ? t("notifications.empty") : t("notifications.emptyUnread")}
            </p>
            {!showAll ? (
              <Button type="button" variant="ghost" className="px-2 py-1" onClick={() => setShowAll(true)}>
                {t("notifications.showAll")}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={`rounded-md border p-4 transition-colors ${
                  notification.is_read
                    ? "border-line-soft bg-surface"
                    : "border-amber-200 bg-amber-50/60"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-brand-900">
                    {notification.title}
                  </p>
                  {!notification.is_read ? (
                    <Badge tone="pending">{t("notifications.new")}</Badge>
                  ) : null}
                </div>
                {notification.body ? (
                  <p className="mt-1 text-sm text-ink-muted">
                    {notification.body}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-ink-muted">
                  {formatRelativeOrDate(notification.created_at, locale)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  {notification.entry_url ? (
                    <Link
                      className="text-brand-700 hover:underline"
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
                      className="text-brand-700 hover:underline"
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
                      {t("notifications.markRead")}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
