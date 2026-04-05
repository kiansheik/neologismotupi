import type { ObjectResolution, PipelineState, RootEntry } from "./builder-types";
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
  objectChoice: ObjectResolution | null;
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

  state.derivations.forEach((derivation) => {
    const spec = getPipelineDerivation(derivation.op);
    currentStage = spec.resultCategory === "verb" ? "verb" : "noun";
    if (spec.resultCategory === "verb") {
      transitivity = spec.setsTransitivity ?? transitivity ?? "unknown";
    } else {
      transitivity = null;
    }
  });

  const requiresObject = currentStage === "verb" && transitivity === "transitive";
  const objectResolved = Boolean(
    requiresObject &&
      state.object &&
      state.object.mode !== "open" &&
      state.object.entry,
  );

  return {
    baseStage,
    currentStage,
    transitivity,
    requiresObject,
    objectResolved,
    objectChoice: state.object,
  };
}

export function posLabelForEntry(entry?: RootEntry | null): string {
  if (!entry) return "—";
  const posInfo = posInfoForKind(entry.posKind ?? "unknown");
  const abbrev = entry.posAbbrev || posInfo.abbrev;
  const label = entry.posLabel || posInfo.label;
  return `${abbrev} — ${label}`;
}
