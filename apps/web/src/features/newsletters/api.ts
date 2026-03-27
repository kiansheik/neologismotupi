import { apiFetch } from "@/lib/api";
import type { NewsletterSubscription } from "@/lib/types";

export const NEWSLETTER_WORD_OF_DAY = "palavra_do_dia";

export interface UpdateNewsletterPayload {
  is_active?: boolean;
  preferred_locale?: string;
}

export function listMyNewsletters(): Promise<NewsletterSubscription[]> {
  return apiFetch<NewsletterSubscription[]>("/newsletters/me");
}

export function updateMyNewsletter(
  newsletterKey: string,
  payload: UpdateNewsletterPayload,
): Promise<NewsletterSubscription> {
  return apiFetch<NewsletterSubscription>(`/newsletters/me/${newsletterKey}`, {
    method: "PATCH",
    body: payload,
  });
}

export function unsubscribeNewsletter(token: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/newsletters/unsubscribe", {
    method: "POST",
    body: { token },
  });
}
