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
    case "root":
      return {
        id: node.id,
        kind: "root",
        title: node.headword,
        subtitle: node.gloss || node.pos || node.type,
      };
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
        title: "Posse",
        children: [
          { id: `${node.id}-possessor`, kind: "label", title: "Possuidor" },
          toDisplayNode(node.possessor),
          { id: `${node.id}-possessed`, kind: "label", title: "Possuído" },
          toDisplayNode(node.possessed),
        ],
      };
    case "modifier":
      return {
        id: node.id,
        kind: "modifier",
        title: "Modificador",
        children: [
          { id: `${node.id}-modifier`, kind: "label", title: "Modificador" },
          toDisplayNode(node.modifier),
          { id: `${node.id}-target`, kind: "label", title: "Alvo" },
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
      return "Posse";
    case "modifier":
      return "Modificador";
    default:
      return "";
  }
}
