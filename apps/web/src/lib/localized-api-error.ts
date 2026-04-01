import type { ApiError } from "@/lib/api";
import type { TranslateFn } from "@/i18n";
import type { TranslationKey } from "@/i18n/messages";

const codeToTranslation: Partial<Record<string, TranslationKey>> = {
  unauthenticated: "api.unauthenticated",
  invalid_credentials: "api.invalid_credentials",
  email_in_use: "api.email_in_use",
  email_not_verified: "api.email_not_verified",
  forbidden: "api.forbidden",
  bot_check_failed: "api.bot_check_failed",
  invalid_or_expired_token: "api.invalid_or_expired_token",
  empty_submission: "api.empty_submission",
  no_changes: "api.no_changes",
  possible_duplicates: "api.possible_duplicates",
  entry_not_found: "api.entry_not_found",
  example_not_found: "api.example_not_found",
  comment_not_found: "api.comment_not_found",
  user_not_found: "api.user_not_found",
  notification_not_found: "api.notification_not_found",
  downvote_blocked: "api.downvote_blocked",
  self_vote_forbidden: "api.self_vote_forbidden",
  downvote_comment_required: "api.downvote_comment_required",
  entry_vote_quota: "api.entry_vote_quota",
  invalid_headword_format: "api.invalid_headword_format",
};

export function getLocalizedApiErrorMessage(error: ApiError, t: TranslateFn): string {
  if (error.code === "downvote_comment_required") {
    const min = (error.details as { min_length?: number } | undefined)?.min_length;
    if (typeof min === "number") {
      return t("api.downvote_comment_required", { min });
    }
    return t("api.downvote_comment_required");
  }
  if (error.code === "entry_vote_quota") {
    const needed = (error.details as { needed?: number } | undefined)?.needed;
    if (typeof needed === "number") {
      return t("api.entry_vote_quota", { needed });
    }
    return t("api.entry_vote_quota");
  }
  const key = codeToTranslation[error.code];
  if (!key) {
    return error.message || t("api.request_failed");
  }
  return t(key);
}
