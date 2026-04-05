import { useCallback, useMemo, useState } from "react";

import type { DeriveOperation, ObjectResolution, PipelineState, RootEntry } from "./builder-types";
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
  addModifier: (entry: RootEntry) => void;
  removeModifier: (index: number) => void;
  moveModifier: (fromIndex: number, toIndex: number) => void;
  setObjectChoice: (choice: ObjectResolution | null) => void;
  setTransitivityOverride: (value: "transitive" | "intransitive" | null) => void;
  addDerivation: (operation: DeriveOperation) => void;
  removeDerivation: (id: string) => void;
  moveDerivation: (fromIndex: number, toIndex: number) => void;
  setDerivationAgent: (id: string, agent: RootEntry | null) => void;
  reset: () => void;
};

const GENERIC_OBJECTS = {
  generic_nonhuman: buildGenericEntry("mba'e", "noun", "coisa"),
  generic_human: buildGenericEntry("moro", "pronoun", "gente"),
};

const INITIAL_STATE: PipelineState = {
  base: null,
  modifiers: [],
  object: null,
  derivations: [],
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

  const addModifier = useCallback((entry: RootEntry) => {
    setState((prev) => ({ ...prev, modifiers: [...prev.modifiers, entry] }));
  }, []);

  const removeModifier = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      modifiers: prev.modifiers.filter((_, idx) => idx !== index),
    }));
  }, []);

  const moveModifier = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev.modifiers];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return { ...prev, modifiers: next };
    });
  }, []);

  const setObjectChoice = useCallback((choice: ObjectResolution | null) => {
    setState((prev) => ({ ...prev, object: choice }));
  }, []);

  const setTransitivityOverride = useCallback((value: "transitive" | "intransitive" | null) => {
    setState((prev) => ({ ...prev, transitivityOverride: value }));
  }, []);

  const addDerivation = useCallback((operation: DeriveOperation) => {
    setState((prev) => ({
      ...prev,
      derivations: [...prev.derivations, { id: createId("derive"), op: operation }],
    }));
  }, []);

  const removeDerivation = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      derivations: prev.derivations.filter((item) => item.id !== id),
    }));
  }, []);

  const moveDerivation = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev.derivations];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return { ...prev, derivations: next };
    });
  }, []);

  const setDerivationAgent = useCallback((id: string, agent: RootEntry | null) => {
    setState((prev) => ({
      ...prev,
      derivations: prev.derivations.map((item) =>
        item.id === id ? { ...item, agent } : item,
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
    addModifier,
    removeModifier,
    moveModifier,
    setObjectChoice,
    setTransitivityOverride,
    addDerivation,
    removeDerivation,
    moveDerivation,
    setDerivationAgent,
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
  return {
    headword,
    gloss,
    posAbbrev: posInfo.abbrev,
    posLabel: posInfo.label,
    posKind: posInfo.kind,
    posAssumed: false,
    type: "manual",
    rawDefinition: gloss,
  };
}
