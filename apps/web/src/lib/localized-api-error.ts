import type { ApiError } from "@/lib/api";
import type { TranslateFn } from "@/i18n";
import type { TranslationKey } from "@/i18n/messages";

const codeToTranslation: Partial<Record<string, TranslationKey>> = {
  unauthenticated: "api.unauthenticated",
  invalid_credentials: "api.invalid_credentials",
  email_in_use: "api.email_in_use",
  forbidden: "api.forbidden",
  bot_check_failed: "api.bot_check_failed",
  empty_submission: "api.empty_submission",
  no_changes: "api.no_changes",
  possible_duplicates: "api.possible_duplicates",
  entry_not_found: "api.entry_not_found",
  example_not_found: "api.example_not_found",
  user_not_found: "api.user_not_found",
  downvote_blocked: "api.downvote_blocked",
  self_vote_forbidden: "api.self_vote_forbidden",
};

export function getLocalizedApiErrorMessage(error: ApiError, t: TranslateFn): string {
  const key = codeToTranslation[error.code];
  if (!key) {
    return error.message || t("api.request_failed");
  }
  return t(key);
}
