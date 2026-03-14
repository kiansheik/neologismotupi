function splitBySentenceBoundary(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ(])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function splitEntryDefinition(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks = normalized
    .split(/[\n;]+/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const chunk of chunks) {
    const bySentence = splitBySentenceBoundary(chunk);
    if (bySentence.length > 1) {
      parts.push(...bySentence);
    } else {
      parts.push(chunk);
    }
  }

  return parts;
}

export function entryDefinitionPreview(
  value: string | null | undefined,
  options: { maxParts?: number } = {},
): string {
  const maxParts = options.maxParts ?? 2;
  const parts = splitEntryDefinition(value);
  if (parts.length === 0) {
    return "";
  }
  if (parts.length <= maxParts) {
    return parts.join(" · ");
  }
  return `${parts.slice(0, maxParts).join(" · ")}...`;
}

