import { DERIVE_OPERATIONS } from "./builder-types";
import type { BuilderNode } from "./builder-types";

export type DisplayNode = {
  id: string;
  title: string;
  subtitle?: string;
  kind: string;
  children?: DisplayNode[];
};

export function toDisplayNode(node: BuilderNode): DisplayNode {
  switch (node.kind) {
    case "root": {
      const label = node.posLabel ? (node.posAssumed ? `${node.posLabel} (assumido)` : node.posLabel) : undefined;
      const posTag = node.posAbbrev ? `(${node.posAbbrev})` : undefined;
      const subtitle = [node.gloss, posTag, label].filter(Boolean).join(" · ") || undefined;
      return {
        id: node.id,
        kind: "root",
        title: node.headword,
        subtitle: subtitle ?? node.type,
      };
    }
    case "compound":
      return {
        id: node.id,
        kind: "compound",
        title: `Compósito (${node.children.length})`,
        children: node.children.map(toDisplayNode),
      };
    case "derive": {
      const op = DERIVE_OPERATIONS[node.operation];
      return {
        id: node.id,
        kind: "derive",
        title: `${op.token} — ${op.note}`,
        children: [toDisplayNode(node.child), ...(node.agent ? [toDisplayNode(node.agent)] : [])],
      };
    }
    case "postposition":
      return {
        id: node.id,
        kind: "postposition",
        title: `Pós-posição: ${node.postposition}`,
        children: [toDisplayNode(node.child)],
      };
    case "possessor":
      return {
        id: node.id,
        kind: "possessor",
        title: "Complemento (de)",
        children: [
          { id: `${node.id}-possessor`, kind: "label", title: "Complemento" },
          toDisplayNode(node.possessor),
          { id: `${node.id}-possessed`, kind: "label", title: "Núcleo" },
          toDisplayNode(node.possessed),
        ],
      };
    case "modifier":
      return {
        id: node.id,
        kind: "modifier",
        title: "Adjunto",
        children: [
          { id: `${node.id}-modifier`, kind: "label", title: "Adjunto" },
          toDisplayNode(node.modifier),
          { id: `${node.id}-target`, kind: "label", title: "Núcleo" },
          toDisplayNode(node.target),
        ],
      };
    default:
      return {
        id: node.id,
        kind: "unknown",
        title: "",
      };
  }
}

export function nodeActionLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "root":
      return "Raiz";
    case "compound":
      return "Compósito";
    case "derive":
      return "Derivação";
    case "postposition":
      return "Pós-posição";
    case "possessor":
      return "Complemento";
    case "modifier":
      return "Adjunto";
    default:
      return "";
  }
}
