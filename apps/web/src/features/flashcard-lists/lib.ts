import type { FlashcardList } from "@/lib/types";
import type { Locale } from "@/i18n";

export function resolveFlashcardListTitle(list: FlashcardList, locale: Locale): string {
  if (locale === "en-US") {
    return list.title_en || list.title_pt;
  }
  return list.title_pt || list.title_en || list.id;
}

export function resolveFlashcardListDescription(list: FlashcardList, locale: Locale): string | null {
  if (locale === "en-US") {
    return list.description_en || list.description_pt || null;
  }
  return list.description_pt || list.description_en || null;
}
