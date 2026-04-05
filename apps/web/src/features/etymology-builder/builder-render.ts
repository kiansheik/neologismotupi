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
        title: "Possuidor",
        children: [
          { id: `${node.id}-possessor`, kind: "label", title: "Possuidor" },
          toDisplayNode(node.possessor),
          { id: `${node.id}-possessed`, kind: "label", title: "Núcleo" },
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
          { id: `${node.id}-target`, kind: "label", title: "Núcleo" },
          toDisplayNode(node.target),
        ],
      };
    case "verb_frame": {
      return {
        id: node.id,
        kind: "verb_frame",
        title: "Predicado verbal",
        children: [
          { id: `${node.id}-verb`, kind: "label", title: "Verbo" },
          toDisplayNode(node.verb),
          ...(node.subject ? [toDisplayNode(node.subject)] : []),
          ...(node.object ? [toDisplayNode(node.object)] : []),
        ],
      };
    }
    case "verb_argument": {
      const roleLabel = node.role === "subject" ? "Sujeito" : "Objeto";
      const statusLabel =
        node.status === "explicit" ? "explícito" : node.status === "omitted" ? "omitido" : "a definir";
      return {
        id: node.id,
        kind: "verb_argument",
        title: `${roleLabel} (${statusLabel})`,
        children: node.value ? [toDisplayNode(node.value)] : undefined,
      };
    }
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
      return "Possuidor";
    case "modifier":
      return "Modificador";
    case "verb_frame":
      return "Predicado verbal";
    case "verb_argument":
      return "Argumento";
    default:
      return "";
  }
}
