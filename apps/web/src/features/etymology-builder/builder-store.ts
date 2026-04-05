import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyPendingInsert,
  createRootNode,
  moveCompoundChild,
  removeNode,
  swapDeriveWithChild,
  updatePostposition,
  wrapWithDerive,
  setDeriveAgent,
  addRootToTree,
  addRootToCompound,
  combineWithRoot,
  attachModifier,
  attachPossessor,
  wrapWithPostposition,
} from "./builder-state";
import type { BuilderNode, DeriveOperation, PendingInsert, RootEntry, RootNode } from "./builder-types";
import { collectPieces, renderPydicate } from "./pydicate-preview";
import { renderHumanNote } from "./note-export";

export type BuilderStore = {
  root: BuilderNode | null;
  pendingInsert: PendingInsert | null;
  activeNodeId: string | null;
  generatedNote: string;
  pydicatePreview: string;
  pieces: string[];
  setPendingInsert: (pending: PendingInsert | null) => void;
  setActiveNodeId: (nodeId: string | null) => void;
  setRoot: (root: BuilderNode | null) => void;
  setRootAndFocus: (root: BuilderNode | null, focusId?: string | null) => void;
  applyRootEntry: (entry: RootEntry) => RootNode;
  applyDerive: (targetId: string, operation: DeriveOperation) => void;
  removeNode: (targetId: string) => void;
  moveCompoundChild: (compoundId: string, fromIndex: number, toIndex: number) => void;
  swapDerive: (targetId: string) => void;
  updatePostposition: (targetId: string, postposition: string) => void;
  attachPossessor: (targetId: string, possessor: RootEntry) => void;
  attachModifier: (targetId: string, modifier: RootEntry) => void;
  wrapPostposition: (targetId: string, postposition: string) => void;
  addCompoundChild: (targetId: string | null, entry: RootEntry) => void;
  combineWithRoot: (targetId: string, entry: RootEntry) => void;
  setDeriveAgent: (targetId: string, entry: RootEntry) => void;
};

export function useEtymologyBuilderStore(): BuilderStore {
  const [root, setRoot] = useState<BuilderNode | null>(null);
  const [pendingInsert, setPendingInsert] = useState<PendingInsert | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const generatedNote = useMemo(() => renderHumanNote(root), [root]);
  const pydicatePreview = useMemo(() => renderPydicate(root), [root]);
  const pieces = useMemo(() => collectPieces(root), [root]);

  useEffect(() => {
    if (!root) {
      setActiveNodeId(null);
    }
  }, [root]);

  const setRootAndFocus = useCallback((nextRoot: BuilderNode | null, focusId?: string | null) => {
    setRoot(nextRoot);
    setActiveNodeId(focusId ?? nextRoot?.id ?? null);
  }, []);

  const applyRootEntry = useCallback(
    (entry: RootEntry) => {
      const newRoot = createRootNode(entry);
      setRoot((current) => applyPendingInsert(current, pendingInsert, newRoot));
      setPendingInsert(null);
      setActiveNodeId((current) => current ?? newRoot.id);
      return newRoot;
    },
    [pendingInsert],
  );

  const applyDerive = useCallback((targetId: string, operation: DeriveOperation) => {
    setRoot((current) => (current ? wrapWithDerive(current, targetId, operation) : current));
    setActiveNodeId(targetId);
  }, []);

  const removeNodeById = useCallback(
    (targetId: string) => {
      if (!root) return;
      const next = removeNode(root, targetId);
      setRoot(next);
      if (activeNodeId === targetId) {
        setActiveNodeId(next?.id ?? null);
      }
    },
    [root, activeNodeId],
  );

  const moveCompoundChildById = useCallback((compoundId: string, fromIndex: number, toIndex: number) => {
    setRoot((current) => (current ? moveCompoundChild(current, compoundId, fromIndex, toIndex) : current));
  }, []);

  const swapDeriveById = useCallback((targetId: string) => {
    setRoot((current) => (current ? swapDeriveWithChild(current, targetId) : current));
  }, []);

  const updatePostpositionById = useCallback((targetId: string, postposition: string) => {
    setRoot((current) => (current ? updatePostposition(current, targetId, postposition) : current));
  }, []);

  const attachPossessorById = useCallback((targetId: string, entry: RootEntry) => {
    const possessor = createRootNode(entry);
    setRoot((current) => (current ? attachPossessor(current, targetId, possessor) : current));
  }, []);

  const attachModifierById = useCallback((targetId: string, entry: RootEntry) => {
    const modifier = createRootNode(entry);
    setRoot((current) => (current ? attachModifier(current, targetId, modifier) : current));
  }, []);

  const wrapPostpositionById = useCallback((targetId: string, postposition: string) => {
    setRoot((current) => (current ? wrapWithPostposition(current, targetId, postposition) : current));
  }, []);

  const addCompoundChildById = useCallback((targetId: string | null, entry: RootEntry) => {
    const child = createRootNode(entry);
    setRoot((current) => {
      if (!current) return child;
      if (!targetId) return addRootToTree(current, child);
      return addRootToCompound(current, targetId, child);
    });
    setActiveNodeId((current) => current ?? child.id);
  }, []);

  const combineWithRootById = useCallback((targetId: string, entry: RootEntry) => {
    const child = createRootNode(entry);
    setRoot((current) => (current ? combineWithRoot(current, targetId, child) : current));
    setActiveNodeId((current) => current ?? child.id);
  }, []);

  const setDeriveAgentById = useCallback((targetId: string, entry: RootEntry) => {
    const agent = createRootNode(entry);
    setRoot((current) => (current ? setDeriveAgent(current, targetId, agent) : current));
    setActiveNodeId((current) => current ?? agent.id);
  }, []);

  return {
    root,
    pendingInsert,
    activeNodeId,
    generatedNote,
    pydicatePreview,
    pieces,
    setPendingInsert,
    setActiveNodeId,
    setRoot,
    setRootAndFocus,
    applyRootEntry,
    applyDerive,
    removeNode: removeNodeById,
    moveCompoundChild: moveCompoundChildById,
    swapDerive: swapDeriveById,
    updatePostposition: updatePostpositionById,
    attachPossessor: attachPossessorById,
    attachModifier: attachModifierById,
    wrapPostposition: wrapPostpositionById,
    addCompoundChild: addCompoundChildById,
    combineWithRoot: combineWithRootById,
    setDeriveAgent: setDeriveAgentById,
  };
}
