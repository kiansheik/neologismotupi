import { useCallback, useMemo, useState } from "react";

import type {
  DeriveOperation,
  ObjectResolution,
  PipelineState,
  PostpositionValue,
  RootEntry,
} from "./builder-types";
import { renderHumanNote } from "./note-export";
import { renderPydicate } from "./pydicate-preview";
import { computePipelineMeta, createId } from "./pipeline-utils";
import { posInfoForKind } from "./pos";

export type BuilderStore = {
  state: PipelineState;
  meta: ReturnType<typeof computePipelineMeta>;
  generatedNote: string;
  pydicatePreview: string;
  setBase: (entry: RootEntry | null) => void;
  addComposeStep: (entry?: RootEntry | null) => void;
  updateComposeStep: (id: string, entry: RootEntry | null) => void;
  addObjectStep: (resolution?: ObjectResolution) => void;
  updateObjectStep: (id: string, resolution: ObjectResolution) => void;
  addPostpositionStep: (value: PostpositionValue) => void;
  setPostpositionStep: (id: string, value: PostpositionValue) => void;
  addDerivationStep: (operation: DeriveOperation) => void;
  removeStep: (id: string) => void;
  moveStep: (fromIndex: number, toIndex: number) => void;
  setDerivationAgent: (id: string, agent: RootEntry | null) => void;
  setTransitivityOverride: (value: "transitive" | "intransitive" | null) => void;
  reset: () => void;
};

const GENERIC_OBJECTS = {
  generic_nonhuman: buildGenericEntry("mba'e", "noun", "coisa"),
  generic_human: buildGenericEntry("moro", "pronoun", "gente"),
};

const INITIAL_STATE: PipelineState = {
  base: null,
  steps: [],
  transitivityOverride: null,
};

export function useEtymologyBuilderStore(): BuilderStore {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);

  const meta = useMemo(() => computePipelineMeta(state), [state]);
  const generatedNote = useMemo(() => renderHumanNote(state), [state]);
  const pydicatePreview = useMemo(() => renderPydicate(state), [state]);

  const setBase = useCallback((entry: RootEntry | null) => {
    setState((prev) => {
      if (!entry) {
        return { ...INITIAL_STATE };
      }
      const same =
        prev.base &&
        prev.base.headword === entry.headword &&
        prev.base.posKind === entry.posKind &&
        prev.base.rawDefinition === entry.rawDefinition;
      if (same) {
        return { ...prev, base: entry };
      }
      return {
        ...INITIAL_STATE,
        base: entry,
      };
    });
  }, []);

  const addComposeStep = useCallback((entry?: RootEntry | null) => {
    setState((prev) => ({
      ...prev,
      steps: [...prev.steps, { id: createId("compose"), kind: "compose", entry: entry ?? null }],
    }));
  }, []);

  const updateComposeStep = useCallback((id: string, entry: RootEntry | null) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.id === id && step.kind === "compose" ? { ...step, entry } : step,
      ),
    }));
  }, []);

  const addDerivationStep = useCallback((operation: DeriveOperation) => {
    setState((prev) => ({
      ...prev,
      steps: [...prev.steps, { id: createId("derive"), kind: "derive", op: operation }],
    }));
  }, []);

  const addPostpositionStep = useCallback((value: PostpositionValue) => {
    setState((prev) => ({
      ...prev,
      steps: [...prev.steps, { id: createId("postposition"), kind: "postposition", value }],
    }));
  }, []);

  const setPostpositionStep = useCallback((id: string, value: PostpositionValue) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.id === id && step.kind === "postposition" ? { ...step, value } : step,
      ),
    }));
  }, []);

  const addObjectStep = useCallback((resolution?: ObjectResolution) => {
    setState((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          id: createId("object"),
          kind: "object",
          resolution: resolution ?? makeObjectChoice("open"),
        },
      ],
    }));
  }, []);

  const updateObjectStep = useCallback((id: string, resolution: ObjectResolution) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.id === id && step.kind === "object" ? { ...step, resolution } : step,
      ),
    }));
  }, []);

  const removeStep = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.filter((step) => step.id !== id),
    }));
  }, []);

  const moveStep = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev.steps];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return { ...prev, steps: next };
    });
  }, []);

  const setTransitivityOverride = useCallback((value: "transitive" | "intransitive" | null) => {
    setState((prev) => ({ ...prev, transitivityOverride: value }));
  }, []);

  const setDerivationAgent = useCallback((id: string, agent: RootEntry | null) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((item) =>
        item.id === id && item.kind === "derive" ? { ...item, agent } : item,
      ),
    }));
  }, []);

  const reset = useCallback(() => setState({ ...INITIAL_STATE }), []);

  return {
    state,
    meta,
    generatedNote,
    pydicatePreview,
    setBase,
    addComposeStep,
    updateComposeStep,
    addObjectStep,
    updateObjectStep,
    addPostpositionStep,
    setPostpositionStep,
    addDerivationStep,
    removeStep,
    moveStep,
    setDerivationAgent,
    setTransitivityOverride,
    reset,
  };
}

export function makeObjectChoice(mode: "open"): ObjectResolution;
export function makeObjectChoice(mode: "generic_nonhuman" | "generic_human"): ObjectResolution;
export function makeObjectChoice(mode: "root" | "manual", entry: RootEntry): ObjectResolution;
export function makeObjectChoice(mode: ObjectResolution["mode"], entry?: RootEntry): ObjectResolution {
  if (mode === "open") {
    return { mode };
  }
  if (mode === "generic_nonhuman") {
    return { mode, entry: GENERIC_OBJECTS.generic_nonhuman };
  }
  if (mode === "generic_human") {
    return { mode, entry: GENERIC_OBJECTS.generic_human };
  }
  if (entry) {
    return { mode, entry };
  }
  return { mode };
}

function buildGenericEntry(headword: string, posKind: RootEntry["posKind"], gloss: string): RootEntry {
  const posInfo = posInfoForKind(posKind ?? "noun");
  const pydicateLiteral = posKind === "pronoun" ? headword : undefined;
  return {
    headword,
    gloss,
    posAbbrev: posInfo.abbrev,
    posLabel: posInfo.label,
    posKind: posInfo.kind,
    posAssumed: false,
    type: "manual",
    rawDefinition: gloss,
    pydicateLiteral,
  };
}
