// Keep this set in sync with app/core/utils.py. Each replacement preserves length.
const APOSTROPHE_VARIANTS = /[\u2018\u2019\u201a\u201b\u02bb\u02bc\u2032\u2035\uff07]/g;

export function normalizeApostrophes(value: string): string {
  return value.replace(APOSTROPHE_VARIANTS, "'");
}

export function normalizeTextInput(input: HTMLInputElement | HTMLTextAreaElement): void {
  const normalized = normalizeApostrophes(input.value);
  if (normalized === input.value) return;

  const { selectionStart, selectionEnd, selectionDirection } = input;
  input.value = normalized;
  if (selectionStart !== null && selectionEnd !== null) {
    input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
  }
}
