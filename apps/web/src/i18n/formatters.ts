import type { EntryStatus, ExampleStatus, ModerationReport } from "@/lib/types";
import type { TranslationKey } from "@/i18n/messages";
import type { Locale, TranslateFn } from "@/i18n";

export function statusToKey(status: EntryStatus | ExampleStatus): TranslationKey {
  switch (status) {
    case "approved":
      return "status.approved";
    case "pending":
      return "status.pending";
    case "disputed":
      return "status.disputed";
    case "rejected":
      return "status.rejected";
    case "archived":
      return "status.archived";
    case "hidden":
      return "status.hidden";
    default:
      return "status.pending";
  }
}

export function partOfSpeechLabel(partOfSpeech: string, t: TranslateFn): string {
  switch (partOfSpeech) {
    case "noun":
      return t("partOfSpeech.noun");
    case "verb":
      return t("partOfSpeech.verb");
    case "adjective":
      return t("partOfSpeech.adjective");
    case "adverb":
      return t("partOfSpeech.adverb");
    case "expression":
      return t("partOfSpeech.expression");
    case "pronoun":
      return t("partOfSpeech.pronoun");
    case "particle":
      return t("partOfSpeech.particle");
    default:
      return t("partOfSpeech.other");
  }
}

export function reportTargetLabel(target: ModerationReport["target_type"], t: TranslateFn): string {
  switch (target) {
    case "entry":
      return t("reports.target.entry");
    case "example":
      return t("reports.target.example");
    case "profile":
      return t("reports.target.profile");
    default:
      return t("reports.target.entry");
  }
}

export function reportReasonLabel(reason: string, t: TranslateFn): string {
  switch (reason) {
    case "spam":
      return t("reports.reason.spam");
    case "harassment":
      return t("reports.reason.harassment");
    case "bad_faith":
      return t("reports.reason.bad_faith");
    case "duplicate":
      return t("reports.reason.duplicate");
    case "offensive":
      return t("reports.reason.offensive");
    case "incorrect":
      return t("reports.reason.incorrect");
    default:
      return t("reports.reason.other");
  }
}

export function reportStatusLabel(status: ModerationReport["status"], t: TranslateFn): string {
  switch (status) {
    case "open":
      return t("reports.status.open");
    case "reviewed":
      return t("reports.status.reviewed");
    case "resolved":
      return t("reports.status.resolved");
    case "dismissed":
      return t("reports.status.dismissed");
    default:
      return t("reports.status.open");
  }
}

export function formatDateTime(iso: string, locale: Locale): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function formatDate(iso: string, locale: Locale): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
  }).format(parsed);
}
