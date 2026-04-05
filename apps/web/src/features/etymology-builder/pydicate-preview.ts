import { DERIVE_OPERATIONS } from "./builder-types";
import type { PipelineState, RootEntry } from "./builder-types";
import type { RootPosKind } from "./pos";
import { inferTransitivity } from "./pipeline-utils";
import { getPipelineDerivation } from "./pipeline-derivations";

export function renderPydicate(state: PipelineState): string {
  if (!state.base) return "";

  let expr = formatRootEntry(state.base);

  state.modifiers.forEach((modifier) => {
    expr = `${wrapIfNeeded(expr)} / ${wrapIfNeeded(formatRootEntry(modifier))}`;
  });

  const objectEntry = state.object && state.object.mode !== "open" ? state.object.entry : undefined;
  let transitivity = inferTransitivity(state.base, state.transitivityOverride);
  let objectApplied = false;

  const applyObjectIfNeeded = () => {
    if (objectApplied) return;
    if (!objectEntry) return;
    if (transitivity !== "transitive") return;
    expr = `${wrapIfNeeded(expr)} * ${wrapIfNeeded(formatRootEntry(objectEntry))}`;
    objectApplied = true;
  };

  if (transitivity === "transitive") {
    applyObjectIfNeeded();
  }

  state.derivations.forEach((derivation) => {
    const spec = getPipelineDerivation(derivation.op);
    const op = DERIVE_OPERATIONS[derivation.op];

    if (spec.resultCategory !== "verb") {
      applyObjectIfNeeded();
    }

    const token = op.pydicate ?? op.token;
    if (op.needsAgent && derivation.agent) {
      expr = `${token} * (${wrapIfNeeded(expr)} * ${wrapIfNeeded(formatRootEntry(derivation.agent))})`;
    } else {
      expr = `${token} * ${wrapIfNeeded(expr)}`;
    }

    if (spec.resultCategory === "verb") {
      transitivity = spec.setsTransitivity ?? transitivity ?? "unknown";
    } else {
      transitivity = null;
    }
  });

  applyObjectIfNeeded();

  return expr;
}

function wrapIfNeeded(expr: string): string {
  if (needsWrap(expr)) {
    return `(${expr})`;
  }
  return expr;
}

function needsWrap(expr: string): boolean {
  return expr.includes(" + ") || expr.includes(" * ") || expr.includes(" / ");
}

const POS_CTORS: Record<RootPosKind, string> = {
  noun: "Noun",
  verb_tr: "Verb",
  verb_intr: "Verb",
  verb: "Verb",
  postposition: "Postposition",
  adjective: "Noun",
  adverb: "Adverb",
  pronoun: "Pronoun",
  interjection: "Interjection",
  conjunction: "Conjunction",
  demonstrative: "Demonstrative",
  number: "Number",
  particle: "Particle",
  article: "Particle",
  preposition: "Postposition",
  proper_noun: "ProperNoun",
  copula: "Copula",
  composition: "Composition",
  unknown: "Noun",
};

export function formatRootEntry(entry: RootEntry): string {
  const kind = entry.posKind ?? "unknown";
  const ctor = POS_CTORS[kind] ?? "Noun";
  if (ctor === "Verb") {
    return formatVerbCall(entry);
  }
  const hint = posHint(entry);
  const shouldIncludeDefinition = entry.type === "manual" || entry.type === "neo";
  const definition = shouldIncludeDefinition
    ? entry.rawDefinition?.trim() || entry.gloss?.trim() || undefined
    : undefined;
  return formatCtorCall(ctor, entry.headword, hint, definition);
}

function posHint(entry: RootEntry): string | undefined {
  if (entry.rawDefinition) {
    const header = extractDefinitionHeader(entry.rawDefinition);
    if (header) return header;
  }
  if (entry.posAbbrev) {
    return `(${entry.posAbbrev})`;
  }
  return undefined;
}

function verbClassHint(entry: RootEntry): string | undefined {
  const header = entry.rawDefinition ? extractDefinitionHeader(entry.rawDefinition) : undefined;
  if (header && header.includes("v")) return header;
  if (entry.posAbbrev) {
    return `(${entry.posAbbrev})`;
  }
  return header;
}

function formatVerbCall(entry: RootEntry): string {
  const isManual = entry.type === "manual";
  const isNeo = entry.type === "neo";
  if (!isManual && !isNeo) {
    return formatCtorCall("Verb", entry.headword);
  }
  const verbClass = verbClassHint(entry);
  const rawDefinition = entry.rawDefinition?.trim() || entry.gloss?.trim() || undefined;
  if (verbClass && rawDefinition) {
    return formatCtorCall("Verb", entry.headword, verbClass, rawDefinition);
  }
  if (verbClass) {
    return formatCtorCall("Verb", entry.headword, verbClass);
  }
  if (rawDefinition) {
    return formatCtorCall("Verb", entry.headword, undefined, rawDefinition);
  }
  return formatCtorCall("Verb", entry.headword);
}

function extractDefinitionHeader(definition: string): string | undefined {
  const match = definition.trim().match(/^(?:\([^)]*\)\s*){1,4}/);
  if (match && match[0]) {
    return match[0].trim();
  }
  return undefined;
}

function formatCtorCall(ctor: string, value: string, hint?: string, definition?: string): string {
  if (ctor === "Copula" || ctor === "Composition") {
    return `${ctor}()`;
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  const args = [`"${escaped}"`];
  if (hint) {
    const escapedHint = hint.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    args.push(`"${escapedHint}"`);
  }
  if (definition) {
    const escapedDefinition = definition.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    args.push(`"${escapedDefinition}"`);
  }
  return `${ctor}(${args.join(", ")})`;
}
