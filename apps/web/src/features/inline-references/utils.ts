import type { EntrySummary, NavarroEntry } from "@/lib/types";

export type InlineReferenceType = "dta" | "neo";

export type InlineReferenceToken = {
  type: InlineReferenceType;
  id: string;
  label: string;
  slug?: string;
  raw: string;
};

export type InlineReferenceContext = {
  type: InlineReferenceType;
  query: string;
  start: number;
  end: number;
};

export type InlineReferenceSegment =
  | { type: "text"; value: string }
  | { type: "token"; value: InlineReferenceToken };

const INLINE_TRIGGER_PATTERN = /(?:^|[\s(])((?:dta|neo))\s+([^\n]*)$/i;
const INLINE_TOKEN_PATTERN = /\[\[(dta|neo):([^\]]+)\]\]/g;

const TOKEN_CLEAN_PATTERN = /[|\]]/g;

export function buildNavarroLabel(entry: NavarroEntry): string {
  const optional = entry.optional_number?.trim();
  return optional ? `${entry.first_word} ${optional}` : entry.first_word;
}

export function buildNavarroToken(entry: NavarroEntry): string {
  const label = buildNavarroLabel(entry).replace(TOKEN_CLEAN_PATTERN, "");
  return `[[dta:${entry.id}|${label}]]`;
}

export function buildInlineDtaToken(id: string, label: string): string {
  const cleaned = label.replace(TOKEN_CLEAN_PATTERN, "");
  return `[[dta:${id}|${cleaned}]]`;
}

export function buildNeoToken(entry: EntrySummary): string {
  const label = (entry.headword || entry.slug).replace(TOKEN_CLEAN_PATTERN, "");
  return `[[neo:${entry.id}|${entry.slug}|${label}]]`;
}

export function detectInlineReferenceContext(
  value: string,
  caret: number | null,
): InlineReferenceContext | null {
  if (caret === null || caret < 0) {
    return null;
  }
  const left = value.slice(0, caret);
  const match = left.match(INLINE_TRIGGER_PATTERN);
  if (!match) {
    return null;
  }
  const trigger = (match[1] ?? "").toLowerCase() as InlineReferenceType;
  if (trigger !== "dta" && trigger !== "neo") {
    return null;
  }
  const query = match[2] ?? "";
  const matchIndex = match.index ?? 0;
  const triggerIndex = (match[0] ?? "").toLowerCase().lastIndexOf(trigger);
  if (triggerIndex < 0) {
    return null;
  }
  const start = matchIndex + triggerIndex;
  return {
    type: trigger,
    query,
    start,
    end: caret,
  };
}

export function parseInlineReferenceSegments(text: string): InlineReferenceSegment[] {
  const segments: InlineReferenceSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_TOKEN_PATTERN)) {
    const raw = match[0] ?? "";
    const start = match.index ?? -1;
    if (start < 0) {
      continue;
    }
    const end = start + raw.length;
    if (start > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, start) });
    }
    const token = parseInlineReferenceToken(raw);
    if (token) {
      segments.push({ type: "token", value: token });
    } else {
      segments.push({ type: "text", value: raw });
    }
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }

  return segments;
}

export function parseInlineReferenceToken(raw: string): InlineReferenceToken | null {
  const match = raw.match(/^\[\[(dta|neo):([^\]]+)\]\]$/);
  if (!match) {
    return null;
  }
  const type = match[1] as InlineReferenceType;
  const payload = match[2] ?? "";
  const parts = payload.split("|");
  if (type === "dta") {
    if (parts.length < 2) {
      return null;
    }
    const [id, label] = parts;
    return {
      type,
      id,
      label,
      raw,
    };
  }
  if (parts.length < 3) {
    return null;
  }
  const [id, slug, label] = parts;
  return {
    type,
    id,
    slug,
    label,
    raw,
  };
}

export function buildNavarroExternalSearch(headword: string): string {
  const trimmed = headword.trim();
  if (!trimmed) {
    return "https://kiansheik.io/nhe-enga";
  }
  const query = encodeURIComponent(trimmed);
  return `https://kiansheik.io/nhe-enga/?q=${query}`;
}
