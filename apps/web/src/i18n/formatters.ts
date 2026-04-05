import type { EntryStatus, ExampleStatus, ModerationReport } from "@/lib/types";
import type { TranslationKey } from "@/i18n/messages";
import type { Locale, TranslateFn } from "@/i18n";

function resolveIntlLocale(locale: Locale): string {
  if (locale === "tupi-BR") {
    return "pt-BR";
  }
  return locale;
}

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
    case "verb_tr":
      return t("partOfSpeech.verb_tr");
    case "verb_intr":
      return t("partOfSpeech.verb_intr");
    case "verb_intr_stative":
      return t("partOfSpeech.verb_intr_stative");
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
    case "postposition":
      return t("partOfSpeech.postposition");
    case "conjunction":
      return t("partOfSpeech.conjunction");
    case "interjection":
      return t("partOfSpeech.interjection");
    case "demonstrative":
      return t("partOfSpeech.demonstrative");
    case "number":
      return t("partOfSpeech.number");
    case "proper_noun":
      return t("partOfSpeech.proper_noun");
    case "copula":
      return t("partOfSpeech.copula");
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
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function formatDate(iso: string, locale: Locale): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return iso;
  }
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    dateStyle: "long",
  }).format(parsed);
}

export function formatBytes(bytes: number, locale: Locale): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(resolveIntlLocale(locale), { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`;
}

export function formatRelativeOrDate(iso: string, locale: Locale): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return iso;
  }

  const now = new Date();
  const diffMs = parsed.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const oneMinuteMs = 60 * 1000;
  const oneHourMs = 60 * oneMinuteMs;
  const oneDayMs = 24 * oneHourMs;

  if (absMs >= oneDayMs) {
    return formatDate(iso, locale);
  }

  const rtf = new Intl.RelativeTimeFormat(resolveIntlLocale(locale), { numeric: "auto" });
  if (absMs < oneMinuteMs) {
    const seconds = Math.round(diffMs / 1000);
    return rtf.format(seconds, "second");
  }
  if (absMs < oneHourMs) {
    const minutes = Math.round(diffMs / oneMinuteMs);
    return rtf.format(minutes, "minute");
  }
  const hours = Math.round(diffMs / oneHourMs);
  return rtf.format(hours, "hour");
}

export function formatTimeSince(iso: string, locale: Locale): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.valueOf())) {
    return iso;
  }

  const now = new Date();
  const diffMs = parsed.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const oneMinuteMs = 60 * 1000;
  const oneHourMs = 60 * oneMinuteMs;
  const oneDayMs = 24 * oneHourMs;
  const oneMonthMs = 30 * oneDayMs;
  const oneYearMs = 365 * oneDayMs;

  const rtf = new Intl.RelativeTimeFormat(resolveIntlLocale(locale), { numeric: "auto" });
  if (absMs < oneMinuteMs) {
    return rtf.format(Math.round(diffMs / 1000), "second");
  }
  if (absMs < oneHourMs) {
    return rtf.format(Math.round(diffMs / oneMinuteMs), "minute");
  }
  if (absMs < oneDayMs) {
    return rtf.format(Math.round(diffMs / oneHourMs), "hour");
  }
  if (absMs < oneMonthMs) {
    return rtf.format(Math.round(diffMs / oneDayMs), "day");
  }
  if (absMs < oneYearMs) {
    return rtf.format(Math.round(diffMs / oneMonthMs), "month");
  }
  return rtf.format(Math.round(diffMs / oneYearMs), "year");
}
