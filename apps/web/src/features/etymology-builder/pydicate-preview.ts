import { DERIVE_OPERATIONS } from "./builder-types";
import type { PipelineState, RootEntry } from "./builder-types";
import type { RootPosKind } from "./pos";
import { inferTransitivity, stageFromPosKind } from "./pipeline-utils";
import { getPipelineDerivation } from "./pipeline-derivations";

export function renderPydicate(state: PipelineState): string {
  if (!state.base) return "";

  let expr = formatRootEntry(state.base);
  let classifierDepth = 0;

  let transitivity = inferTransitivity(state.base, state.transitivityOverride);
  let currentStage = stageFromPosKind(state.base.posKind);
  const applyObject = (entry: RootEntry | null | undefined) => {
    if (!entry) return;
    expr = `${wrapIfNeeded(expr)} * ${wrapIfNeeded(formatRootEntry(entry))}`;
  };

  const isClassifierOp = (opKey: string) => opKey === "future_rama" || opKey === "past_puera";

  state.steps.forEach((step) => {
    if (step.kind === "compose") {
      if (step.entry) {
        if (classifierDepth >= 2) {
          const exprForEval = needsWrap(expr) ? `(${expr})` : expr;
          const frozen = `Noun(${exprForEval}.eval(True), "", noroot=True)`;
          expr = `${wrapIfNeeded(frozen)} / ${wrapIfNeeded(formatRootEntry(step.entry))}`;
          classifierDepth = 0;
        } else {
          expr = `${wrapIfNeeded(expr)} / ${wrapIfNeeded(formatRootEntry(step.entry))}`;
        }
      }
      return;
    }
    if (step.kind === "object") {
      if (currentStage === "verb" && transitivity === "transitive") {
        if (step.resolution.mode !== "open") {
          applyObject(step.resolution.entry);
        }
      }
      return;
    }
    if (step.kind === "postposition") {
      const token = step.value === "ramo" ? "amo" : step.value;
      expr = `${token} * ${wrapIfNeeded(expr)}`;
      transitivity = null;
      currentStage = "adverb";
      classifierDepth = 0;
      return;
    }
    const spec = getPipelineDerivation(step.op);
    const op = DERIVE_OPERATIONS[step.op];

    if (step.op === "basic_a") {
      if (currentStage === "verb") {
        const baseExpr = needsWrap(expr) ? `(${expr})` : expr;
        expr = `${baseExpr}.base_nominal(True)`;
      }
    } else {
      const token = op.pydicate ?? op.token;
      if (op.needsAgent && step.agent) {
        expr = `${token} * (${wrapIfNeeded(expr)} * ${wrapIfNeeded(formatRootEntry(step.agent))})`;
      } else {
        expr = `${token} * ${wrapIfNeeded(expr)}`;
      }
    }

    if (spec.resultCategory === "verb") {
      transitivity = spec.setsTransitivity ?? transitivity ?? "unknown";
      currentStage = "verb";
    } else {
      transitivity = null;
      currentStage = "noun";
    }

    if (isClassifierOp(step.op)) {
      classifierDepth += 1;
    } else {
      classifierDepth = 0;
    }
  });

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
  verb_intr_stative: "Verb",
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
  deadverbal: "Deadverbal",
  composition: "Composition",
  unknown: "Noun",
};

export function formatRootEntry(entry: RootEntry): string {
  if (entry.pydicateLiteral) {
    return entry.pydicateLiteral;
  }
  const kind = entry.posKind ?? "unknown";
  const ctor = POS_CTORS[kind] ?? "Noun";
  if (ctor === "Verb") {
    return formatVerbCall(entry);
  }
  const definition = entry.rawDefinition?.trim() || entry.gloss?.trim() || undefined;
  return formatCtorCallWithDefinition(ctor, entry.headword, definition);
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

function formatCtorCallWithDefinition(ctor: string, value: string, definition?: string): string {
  if (ctor === "Copula" || ctor === "Composition") {
    return `${ctor}()`;
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  const args = [`"${escaped}"`];
  if (definition) {
    const escapedDefinition = definition.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    args.push(`"${escapedDefinition}"`);
  }
  return `${ctor}(${args.join(", ")})`;
}
