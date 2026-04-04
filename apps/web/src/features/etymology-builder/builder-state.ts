import type {
  BuilderNode,
  CompoundNode,
  DeriveOperation,
  DeriveNode,
  ModifierNode,
  PendingInsert,
  PossessorNode,
  PostpositionNode,
  RootEntry,
  RootNode,
} from "./builder-types";

let idCounter = 0;

export function createId(prefix = "node"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function createRootNode(entry: RootEntry): RootNode {
  return {
    id: createId("root"),
    kind: "root",
    headword: entry.headword,
    gloss: entry.gloss,
    posAbbrev: entry.posAbbrev,
    posLabel: entry.posLabel,
    posKind: entry.posKind,
    posAssumed: entry.posAssumed,
    canonical: entry.canonical,
    sourceId: entry.sourceId,
    orthVariants: entry.orthVariants,
    type: entry.type,
    rawDefinition: entry.rawDefinition,
  };
}

export function addRootToTree(root: BuilderNode | null, newRoot: RootNode): BuilderNode {
  if (!root) {
    return newRoot;
  }
  if (root.kind === "compound") {
    return {
      ...root,
      children: [...root.children, newRoot],
    };
  }
  return {
    id: createId("compound"),
    kind: "compound",
    children: [root, newRoot],
  };
}

export function addRootToCompound(
  root: BuilderNode,
  compoundId: string,
  newRoot: RootNode,
): BuilderNode {
  return mapNode(root, (node) => {
    if (node.kind === "compound" && node.id === compoundId) {
      const compound: CompoundNode = {
        ...node,
        children: [...node.children, newRoot],
      };
      return compound;
    }
    return node;
  });
}

export function combineWithRoot(
  root: BuilderNode,
  targetId: string,
  newRoot: RootNode,
): BuilderNode {
  return replaceNode(root, targetId, (node) => ({
    id: createId("compound"),
    kind: "compound",
    children: [node, newRoot],
  }));
}

export function wrapWithDerive(
  root: BuilderNode,
  targetId: string,
  operation: DeriveOperation,
): BuilderNode {
  return replaceNode(root, targetId, (node) => ({
    id: createId("derive"),
    kind: "derive",
    operation,
    child: node,
  }));
}

export function setDeriveAgent(
  root: BuilderNode,
  targetId: string,
  agent: BuilderNode,
): BuilderNode {
  return mapNode(root, (node) => {
    if (node.kind === "derive" && node.id === targetId) {
      const derive: DeriveNode = {
        ...node,
        agent,
      };
      return derive;
    }
    return node;
  });
}

export function wrapWithPostposition(
  root: BuilderNode,
  targetId: string,
  postposition: string,
): BuilderNode {
  return replaceNode(root, targetId, (node) => ({
    id: createId("postposition"),
    kind: "postposition",
    postposition,
    child: node,
  }));
}

export function updatePostposition(
  root: BuilderNode,
  targetId: string,
  postposition: string,
): BuilderNode {
  return mapNode(root, (node) => {
    if (node.kind === "postposition" && node.id === targetId) {
      const updated: PostpositionNode = {
        ...node,
        postposition,
      };
      return updated;
    }
    return node;
  });
}

export function attachPossessor(
  root: BuilderNode,
  targetId: string,
  possessor: BuilderNode,
): BuilderNode {
  return replaceNode(root, targetId, (node) => ({
    id: createId("possessor"),
    kind: "possessor",
    possessor,
    possessed: node,
  }));
}

export function attachModifier(
  root: BuilderNode,
  targetId: string,
  modifier: BuilderNode,
): BuilderNode {
  return replaceNode(root, targetId, (node) => ({
    id: createId("modifier"),
    kind: "modifier",
    modifier,
    target: node,
  }));
}

export function removeNode(root: BuilderNode, targetId: string): BuilderNode | null {
  if (root.id === targetId) {
    return null;
  }

  switch (root.kind) {
    case "compound": {
      const nextChildren = root.children
        .map((child) => removeNode(child, targetId))
        .filter(Boolean) as BuilderNode[];
      if (nextChildren.length === 0) return null;
      if (nextChildren.length === 1) return nextChildren[0];
      return { ...root, children: nextChildren };
    }
    case "derive": {
      const nextChild = removeNode(root.child, targetId);
      if (!nextChild) return null;
      const nextAgent = root.agent ? removeNode(root.agent, targetId) : undefined;
      return {
        ...root,
        child: nextChild,
        agent: nextAgent ?? undefined,
      };
    }
    case "postposition": {
      const nextChild = removeNode(root.child, targetId);
      if (!nextChild) return null;
      return { ...root, child: nextChild };
    }
    case "possessor": {
      const nextPossessor = removeNode(root.possessor, targetId);
      const nextPossessed = removeNode(root.possessed, targetId);
      if (!nextPossessor && !nextPossessed) return null;
      if (!nextPossessor) return nextPossessed;
      if (!nextPossessed) return nextPossessor;
      const nextNode: PossessorNode = {
        ...root,
        possessor: nextPossessor,
        possessed: nextPossessed,
      };
      return nextNode;
    }
    case "modifier": {
      const nextModifier = removeNode(root.modifier, targetId);
      const nextTarget = removeNode(root.target, targetId);
      if (!nextModifier && !nextTarget) return null;
      if (!nextModifier) return nextTarget;
      if (!nextTarget) return nextModifier;
      const nextNode: ModifierNode = {
        ...root,
        modifier: nextModifier,
        target: nextTarget,
      };
      return nextNode;
    }
    default:
      return root;
  }
}

export function moveCompoundChild(
  root: BuilderNode,
  compoundId: string,
  fromIndex: number,
  toIndex: number,
): BuilderNode {
  return mapNode(root, (node) => {
    if (node.kind !== "compound" || node.id !== compoundId) {
      return node;
    }
    const nextChildren = [...node.children];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= nextChildren.length ||
      toIndex >= nextChildren.length
    ) {
      return node;
    }
    const [moved] = nextChildren.splice(fromIndex, 1);
    nextChildren.splice(toIndex, 0, moved);
    return {
      ...node,
      children: nextChildren,
    };
  });
}

export function applyPendingInsert(
  root: BuilderNode | null,
  pending: PendingInsert | null,
  newRoot: RootNode,
): BuilderNode {
  if (!root) {
    return newRoot;
  }
  if (!pending) {
    return addRootToTree(root, newRoot);
  }
  switch (pending.kind) {
    case "compound":
      if (!pending.targetId) {
        return addRootToTree(root, newRoot);
      }
      return addRootToCompound(root, pending.targetId, newRoot);
    case "combine":
      return combineWithRoot(root, pending.targetId, newRoot);
    case "possessor":
      return attachPossessor(root, pending.targetId, newRoot);
    case "modifier":
      return attachModifier(root, pending.targetId, newRoot);
    case "postposition":
      return wrapWithPostposition(root, pending.targetId, newRoot.headword);
    case "derive-agent":
      return setDeriveAgent(root, pending.targetId, newRoot);
    default:
      return root;
  }
}

function mapNode(root: BuilderNode, fn: (node: BuilderNode) => BuilderNode): BuilderNode {
  const updated = fn(root);
  if (updated !== root) {
    return updated;
  }
  switch (root.kind) {
    case "compound":
      return { ...root, children: root.children.map((child) => mapNode(child, fn)) };
    case "derive":
      return {
        ...root,
        child: mapNode(root.child, fn),
        agent: root.agent ? mapNode(root.agent, fn) : undefined,
      };
    case "postposition":
      return { ...root, child: mapNode(root.child, fn) };
    case "possessor":
      return {
        ...root,
        possessor: mapNode(root.possessor, fn),
        possessed: mapNode(root.possessed, fn),
      };
    case "modifier":
      return {
        ...root,
        modifier: mapNode(root.modifier, fn),
        target: mapNode(root.target, fn),
      };
    default:
      return root;
  }
}

function replaceNode(
  root: BuilderNode,
  targetId: string,
  replacer: (node: BuilderNode) => BuilderNode,
): BuilderNode {
  if (root.id === targetId) {
    return replacer(root);
  }
  switch (root.kind) {
    case "compound":
      return {
        ...root,
        children: root.children.map((child) => replaceNode(child, targetId, replacer)),
      };
    case "derive":
      return {
        ...root,
        child: replaceNode(root.child, targetId, replacer),
        agent: root.agent ? replaceNode(root.agent, targetId, replacer) : undefined,
      };
    case "postposition":
      return {
        ...root,
        child: replaceNode(root.child, targetId, replacer),
      };
    case "possessor":
      return {
        ...root,
        possessor: replaceNode(root.possessor, targetId, replacer),
        possessed: replaceNode(root.possessed, targetId, replacer),
      };
    case "modifier":
      return {
        ...root,
        modifier: replaceNode(root.modifier, targetId, replacer),
        target: replaceNode(root.target, targetId, replacer),
      };
    default:
      return root;
  }
}
