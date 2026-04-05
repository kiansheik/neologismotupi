import type { PipelineState, RootEntry } from "./builder-types";
import type { RootPosKind } from "./pos";
import { posInfoForKind } from "./pos";
import { getPipelineDerivation } from "./pipeline-derivations";
import type { PipelineStageKind } from "./pipeline-derivations";

let idCounter = 0;

export function createId(prefix = "item"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export type TransitivityStatus = "transitive" | "intransitive" | "unknown";

export type PipelineMeta = {
  baseStage: PipelineStageKind | null;
  currentStage: PipelineStageKind | null;
  transitivity: TransitivityStatus | null;
  requiresObject: boolean;
  objectResolved: boolean;
};

export type PartOfSpeechValue =
  | "noun"
  | "verb_tr"
  | "verb_intr"
  | "verb_intr_stative"
  | "adjective"
  | "adverb"
  | "expression"
  | "pronoun"
  | "particle"
  | "postposition"
  | "conjunction"
  | "interjection"
  | "demonstrative"
  | "number"
  | "proper_noun"
  | "copula"
  | "other";

const NOUNLIKE_KINDS = new Set<RootPosKind>([
  "noun",
  "adjective",
  "pronoun",
  "demonstrative",
  "number",
  "particle",
  "article",
  "proper_noun",
  "composition",
  "copula",
  "deadverbal",
  "unknown",
]);

export function stageFromPosKind(posKind?: RootPosKind): PipelineStageKind {
  if (!posKind) return "other";
  if (
    posKind === "verb" ||
    posKind === "verb_tr" ||
    posKind === "verb_intr" ||
    posKind === "verb_intr_stative"
  ) {
    return "verb";
  }
  if (posKind === "adverb") return "adverb";
  if (NOUNLIKE_KINDS.has(posKind)) return "noun";
  return "other";
}

export function inferTransitivity(
  entry: RootEntry | null,
  override?: "transitive" | "intransitive" | null,
): TransitivityStatus | null {
  if (!entry) return null;
  if (override) return override;
  const kind = entry.posKind;
  if (kind === "verb_tr") return "transitive";
  if (kind === "verb_intr" || kind === "verb_intr_stative") {
    return "intransitive";
  }
  if (kind === "verb") return "unknown";
  return null;
}

export function computePipelineMeta(state: PipelineState): PipelineMeta {
  const baseStage = state.base ? stageFromPosKind(state.base.posKind) : null;
  let currentStage = baseStage;
  let transitivity = inferTransitivity(state.base, state.transitivityOverride);
  let objectSatisfied = !(currentStage === "verb" && transitivity === "transitive");

  state.steps.forEach((step) => {
    if (step.kind === "compose") {
      return;
    }
    if (step.kind === "object") {
      if (
        currentStage === "verb" &&
        transitivity === "transitive" &&
        step.resolution.mode !== "open" &&
        step.resolution.entry
      ) {
        objectSatisfied = true;
      }
      return;
    }
    const spec = getPipelineDerivation(step.op);
    currentStage = spec.resultCategory === "verb" ? "verb" : "noun";
    if (spec.resultCategory === "verb") {
      transitivity = spec.setsTransitivity ?? transitivity ?? "unknown";
      objectSatisfied = transitivity !== "transitive";
    } else {
      transitivity = null;
      objectSatisfied = true;
    }
  });

  const requiresObject = currentStage === "verb" && transitivity === "transitive";
  const objectResolved = requiresObject ? objectSatisfied : false;

  return {
    baseStage,
    currentStage,
    transitivity,
    requiresObject,
    objectResolved,
  };
}

export function posLabelForEntry(entry?: RootEntry | null): string {
  if (!entry) return "—";
  const posInfo = posInfoForKind(entry.posKind ?? "unknown");
  const abbrev = entry.posAbbrev || posInfo.abbrev;
  const label = entry.posLabel || posInfo.label;
  return `${abbrev} — ${label}`;
}

export function mapPosKindToPartOfSpeech(kind?: RootPosKind | null): PartOfSpeechValue {
  if (!kind) return "other";
  if (kind === "noun") return "noun";
  if (kind === "verb_tr") return "verb_tr";
  if (kind === "verb_intr") return "verb_intr";
  if (kind === "verb_intr_stative") return "verb_intr_stative";
  if (kind === "verb") return "other";
  if (kind === "adjective") return "adjective";
  if (kind === "adverb") return "adverb";
  if (kind === "pronoun") return "pronoun";
  if (kind === "particle") return "particle";
  if (kind === "postposition") return "postposition";
  if (kind === "conjunction") return "conjunction";
  if (kind === "interjection") return "interjection";
  if (kind === "demonstrative") return "demonstrative";
  if (kind === "number") return "number";
  if (kind === "proper_noun") return "proper_noun";
  if (kind === "copula") return "copula";
  return "other";
}

export function inferPartOfSpeechValue(
  state: PipelineState,
  meta: PipelineMeta,
): PartOfSpeechValue | null {
  if (!state.base) return null;
  const hasDerivation = state.steps.some((step) => step.kind === "derive");
  if (!hasDerivation) {
    return mapPosKindToPartOfSpeech(state.base.posKind ?? "unknown");
  }
  if (meta.currentStage === "verb") {
    if (meta.transitivity === "transitive") return "verb_tr";
    if (meta.transitivity === "intransitive") {
      return state.base.posKind === "verb_intr_stative" ? "verb_intr_stative" : "verb_intr";
    }
    return null;
  }
  if (meta.currentStage === "adverb") return "adverb";
  if (meta.currentStage === "noun") return "noun";
  return mapPosKindToPartOfSpeech(state.base.posKind ?? "unknown");
}
