import { normalizeApostrophes } from "@/lib/text";

export function removePunctuation(value: string): string {
  return normalizeApostrophes(value).replace(/[.,\/#!$%?^&*;:{}=\-_`~()]/g, "").trim();
}

export function removeDiacritics(value: string): string {
  return removePunctuation(value.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

export function stripDiacritics(value: string): string {
  return normalizeApostrophes(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeExact(value: string): string {
  return removePunctuation(value).toLowerCase();
}

export function normalizeNoAccent(value: string): string {
  return removeDiacritics(value).toLowerCase();
}
