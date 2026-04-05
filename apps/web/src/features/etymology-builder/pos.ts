export type RootPosKind =
  | "noun"
  | "verb_tr"
  | "verb_intr_stative"
  | "verb_intr"
  | "verb"
  | "postposition"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "interjection"
  | "conjunction"
  | "demonstrative"
  | "number"
  | "particle"
  | "article"
  | "preposition"
  | "proper_noun"
  | "copula"
  | "deadverbal"
  | "composition"
  | "unknown";

export type PosInfo = {
  kind: RootPosKind;
  abbrev: string;
  label: string;
  assumed?: boolean;
};

type PosRule = {
  kind: RootPosKind;
  abbrev: string;
  label: string;
  regex: RegExp;
};

const POS_RULES: PosRule[] = [
  {
    kind: "verb_tr",
    abbrev: "v.tr.",
    label: "verbo transitivo",
    regex: /(\(v\.?\s*tr[^)]*\)|\bv\.?\s*tr\.?\b)/i,
  },
  {
    kind: "verb_intr_stative",
    abbrev: "v. intr. estativo",
    label: "verbo intransitivo estativo",
    regex: /(\b(v\.?\s*)?intr[^)]*(estativo|est\.)|\bintr\.\s*estativo\b|2ª\s*classe|2a\s*classe|v\.\s*da\s*2ª|v\.\s*da\s*2a)/i,
  },
  {
    kind: "verb_intr",
    abbrev: "v. intr.",
    label: "verbo intransitivo",
    regex: /(\(v\.?\s*intr[^)]*\)|\bv\.?\s*intr\.?\b|\bintr\.\s*(ativo|activo)\b|\bintr\.-(ativo|activo))/i,
  },
  {
    kind: "postposition",
    abbrev: "posp.",
    label: "pós-posição",
    regex: /(\(posp\.?\)|\bposp\.?\b)/i,
  },
  {
    kind: "adverb",
    abbrev: "adv.",
    label: "advérbio",
    regex: /(\(adv\.?\)|\badv\.?\b)/i,
  },
  {
    kind: "adjective",
    abbrev: "adj.",
    label: "adjetivo",
    regex: /(\(adj\.?\)|\badj\.?\b|adj\.\s*:)/i,
  },
  {
    kind: "pronoun",
    abbrev: "pron.",
    label: "pronome",
    regex: /(\(pron\.?\)|\bpron\.?\b)/i,
  },
  {
    kind: "interjection",
    abbrev: "interj.",
    label: "interjeição",
    regex: /(\(interj\.?\)|\binterj\.?\b)/i,
  },
  {
    kind: "conjunction",
    abbrev: "conj.",
    label: "conjunção",
    regex: /(\(conj\.?\)|\bconj\.?\b)/i,
  },
  {
    kind: "demonstrative",
    abbrev: "dem.",
    label: "demonstrativo",
    regex: /(\(dem\.?\)|\bdem\.?\b)/i,
  },
  {
    kind: "number",
    abbrev: "num.",
    label: "numeral",
    regex: /(\(num\.?\)|\bnum\.)/i,
  },
  {
    kind: "particle",
    abbrev: "part.",
    label: "partícula",
    regex: /(\(part\.?\)|\bpart\.?\b)/i,
  },
  {
    kind: "article",
    abbrev: "art.",
    label: "artigo",
    regex: /(\(art\.?\)|\bart\.?\b)/i,
  },
  {
    kind: "preposition",
    abbrev: "prep.",
    label: "preposição",
    regex: /(\(prep\.?\)|\bprep\.?\b)/i,
  },
  {
    kind: "copula",
    abbrev: "cop.",
    label: "cópula",
    regex: /(\(cop\.?\)|\bcop\.?\b)/i,
  },
  {
    kind: "deadverbal",
    abbrev: "deadv.",
    label: "deadverbal",
    regex: /(\bdeadverbal\b|\bdeadv\.?\b)/i,
  },
  {
    kind: "proper_noun",
    abbrev: "n. prop.",
    label: "nome próprio",
    regex: /(nome\s+próprio|n\.\s*prop\.?|prop\.\b)/i,
  },
  {
    kind: "verb",
    abbrev: "v.",
    label: "verbo",
    regex: /(\bv\.?\b|v\.\s*da\s*2ª|v\.\s*da\s*2a)/i,
  },
  {
    kind: "noun",
    abbrev: "s.",
    label: "substantivo",
    regex: /(\(s[.,\s)]|\bsubs?\.|\bsubst\.|\bs\.\b)/i,
  },
];

const POS_KIND_META: Record<RootPosKind, PosInfo> = {
  noun: { kind: "noun", abbrev: "s.", label: "substantivo" },
  verb_tr: { kind: "verb_tr", abbrev: "v.tr.", label: "verbo transitivo" },
  verb_intr_stative: { kind: "verb_intr_stative", abbrev: "v. intr. estativo", label: "verbo intransitivo estativo" },
  verb_intr: { kind: "verb_intr", abbrev: "v. intr.", label: "verbo intransitivo" },
  verb: { kind: "verb", abbrev: "v.", label: "verbo" },
  postposition: { kind: "postposition", abbrev: "posp.", label: "pós-posição" },
  adjective: { kind: "adjective", abbrev: "adj.", label: "adjetivo" },
  adverb: { kind: "adverb", abbrev: "adv.", label: "advérbio" },
  pronoun: { kind: "pronoun", abbrev: "pron.", label: "pronome" },
  interjection: { kind: "interjection", abbrev: "interj.", label: "interjeição" },
  conjunction: { kind: "conjunction", abbrev: "conj.", label: "conjunção" },
  demonstrative: { kind: "demonstrative", abbrev: "dem.", label: "demonstrativo" },
  number: { kind: "number", abbrev: "num.", label: "numeral" },
  particle: { kind: "particle", abbrev: "part.", label: "partícula" },
  article: { kind: "article", abbrev: "art.", label: "artigo" },
  preposition: { kind: "preposition", abbrev: "prep.", label: "preposição" },
  proper_noun: { kind: "proper_noun", abbrev: "n. prop.", label: "nome próprio" },
  copula: { kind: "copula", abbrev: "cop.", label: "cópula" },
  deadverbal: { kind: "deadverbal", abbrev: "deadv.", label: "deadverbal (adj. de adv.)" },
  composition: { kind: "composition", abbrev: "comp.", label: "composição" },
  unknown: { kind: "unknown", abbrev: "s.", label: "substantivo", assumed: true },
};

export function posInfoForKind(kind: RootPosKind): PosInfo {
  return POS_KIND_META[kind] ?? POS_KIND_META.unknown;
}

export function parsePosInfo(definition?: string): PosInfo | undefined {
  if (!definition) return undefined;
  const sample = definition.slice(0, 180);
  for (const rule of POS_RULES) {
    if (rule.regex.test(sample)) {
      return { kind: rule.kind, abbrev: rule.abbrev, label: rule.label };
    }
  }
  return undefined;
}

export function defaultPosInfo(): PosInfo {
  return { ...POS_KIND_META.unknown };
}

export function formatPosDisplay(pos?: PosInfo): { primary: string; secondary?: string } | null {
  if (!pos) return null;
  const primary = `(${pos.abbrev})`;
  const secondary = pos.assumed ? `${pos.label} (assumido)` : pos.label;
  return { primary, secondary };
}

export function extractGloss(definition?: string): string | undefined {
  if (!definition) return undefined;
  let text = definition.trim();

  text = text.replace(/^[-–]\s*/, "");
  text = text.replace(/^=\s*/, "");

  const stripLeadingParens = () => {
    let guard = 0;
    while (text.startsWith("(") && guard < 6) {
      const closeIndex = text.indexOf(")");
      if (closeIndex <= 0) break;
      text = text.slice(closeIndex + 1).trim();
      text = text.replace(/^[-–:\s]+/, "");
      guard += 1;
    }
  };

  stripLeadingParens();

  text = text.replace(/^\d+\)\s*/, "");
  text = text.replace(/^\d+\.\s*/, "");
  stripLeadingParens();

  const bulletIndex = text.indexOf("●");
  if (bulletIndex >= 0) {
    const before = text.slice(0, bulletIndex).trim();
    const after = text.slice(bulletIndex + 1).trim();
    const looksLikeHeader = !before || before.length < 18 || /\b(v\.|s\.|adj\.|adv\.|pron\.|posp\.)/i.test(before);
    text = looksLikeHeader && after ? after : before;
  }

  const delimiters = [";", "|"];
  let cutIndex = text.length;
  for (const delimiter of delimiters) {
    const idx = text.indexOf(delimiter);
    if (idx >= 0 && idx < cutIndex) cutIndex = idx;
  }

  const colonIndex = text.indexOf(":");
  if (colonIndex > 0 && colonIndex < cutIndex) {
    cutIndex = colonIndex;
  }

  text = text.slice(0, cutIndex).trim();
  text = text.replace(/[\s.\-–]+$/g, "").trim();

  return text || undefined;
}

export function compactDefinition(definition?: string): string | undefined {
  if (!definition) return undefined;
  const gloss = extractGloss(definition);
  if (gloss) return gloss;
  const trimmed = definition.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed;
}

export const POS_OPTIONS: Array<{ kind: RootPosKind; label: string; abbrev: string }> = [
  { kind: "noun", label: "Substantivo", abbrev: "s." },
  { kind: "verb_tr", label: "Verbo transitivo", abbrev: "v.tr." },
  { kind: "verb_intr_stative", label: "Verbo intransitivo (estativo)", abbrev: "v. intr. estativo" },
  { kind: "verb_intr", label: "Verbo intransitivo", abbrev: "v. intr." },
  { kind: "verb", label: "Verbo (geral)", abbrev: "v." },
  { kind: "postposition", label: "Pós-posição", abbrev: "posp." },
  { kind: "adjective", label: "Adjetivo", abbrev: "adj." },
  { kind: "adverb", label: "Advérbio", abbrev: "adv." },
  { kind: "pronoun", label: "Pronome", abbrev: "pron." },
  { kind: "interjection", label: "Interjeição", abbrev: "interj." },
  { kind: "conjunction", label: "Conjunção", abbrev: "conj." },
  { kind: "demonstrative", label: "Demonstrativo", abbrev: "dem." },
  { kind: "number", label: "Numeral", abbrev: "num." },
  { kind: "particle", label: "Partícula", abbrev: "part." },
  { kind: "article", label: "Artigo", abbrev: "art." },
  { kind: "preposition", label: "Preposição", abbrev: "prep." },
  { kind: "copula", label: "Cópula", abbrev: "cop." },
  { kind: "deadverbal", label: "Deadverbal (adj. de adv.)", abbrev: "deadv." },
  { kind: "proper_noun", label: "Nome próprio", abbrev: "n. prop." },
  { kind: "composition", label: "Composição", abbrev: "comp." },
];
