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
  "unknown",
]);

export function stageFromPosKind(posKind?: RootPosKind): PipelineStageKind {
  if (!posKind) return "other";
  if (posKind === "verb" || posKind === "verb_tr" || posKind === "verb_intr") {
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
  if (kind === "verb_intr") return "intransitive";
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
