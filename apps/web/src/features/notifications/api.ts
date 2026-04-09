import { apiFetch, withQuery } from "@/lib/api";
import type {
  NotificationListResponse,
  NotificationPreferences,
} from "@/lib/types";

export interface ListNotificationsParams {
  [key: string]: string | number | boolean | undefined;
  page?: number;
  page_size?: number;
  unread_only?: boolean;
  kind?: string;
}

export interface UpdateNotificationPreferencesPayload {
  in_app_enabled?: boolean;
  email_enabled?: boolean;
  push_enabled?: boolean;
  notify_on_entry_comments?: boolean;
  notify_on_mentions?: boolean;
}

export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>("/users/me/notification-preferences");
}

export function updateNotificationPreferences(
  payload: UpdateNotificationPreferencesPayload,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>("/users/me/notification-preferences", {
    method: "PATCH",
    body: payload,
  });
}

export function listNotifications(params: ListNotificationsParams): Promise<NotificationListResponse> {
  return apiFetch<NotificationListResponse>(withQuery("/users/me/notifications", params));
}

export function markNotificationRead(notificationId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/users/me/notifications/${notificationId}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/users/me/notifications/read-all", { method: "POST" });
}
