import { DERIVE_OPERATIONS } from "./builder-types";
import type { BuilderNode, DeriveOperation } from "./builder-types";

export function renderHumanNote(node: BuilderNode | null): string {
  if (!node) return "";
  const segments: string[] = [];

  collectSegments(node, segments);

  const summary = describeNode(node);
  if (summary) {
    segments.push(`resultado — ${summary}`);
  }

  return segments.join("; ");
}

function collectSegments(node: BuilderNode, segments: string[]): void {
  switch (node.kind) {
    case "root": {
      const gloss = node.gloss?.trim();
      if (gloss) {
        segments.push(`${node.headword} — ${gloss}`);
      } else {
        segments.push(node.headword);
      }
      return;
    }
    case "compound": {
      node.children.forEach((child) => collectSegments(child, segments));
      return;
    }
    case "derive": {
      const op = DERIVE_OPERATIONS[node.operation];
      segments.push(`${op.token} — ${op.note}`);
      collectSegments(node.child, segments);
      if (node.agent) {
        segments.push(`agente — ${describeNode(node.agent)}`);
      }
      return;
    }
    case "postposition": {
      segments.push(`${node.postposition} — pós-posição`);
      collectSegments(node.child, segments);
      return;
    }
    case "possessor": {
      segments.push(`possuidor — ${describeNode(node.possessor)}`);
      segments.push(`possuído — ${describeNode(node.possessed)}`);
      return;
    }
    case "modifier": {
      segments.push(`modificador — ${describeNode(node.modifier)}`);
      segments.push(`alvo — ${describeNode(node.target)}`);
      return;
    }
    default:
      return;
  }
}

export function describeNode(node: BuilderNode): string {
  switch (node.kind) {
    case "root":
      return node.gloss?.trim() || node.headword;
    case "compound":
      return node.children.map(describeNode).filter(Boolean).join(" + ");
    case "derive":
      return describeDerive(node.operation, describeNode(node.child), node.agent);
    case "postposition":
      return `${describeNode(node.child)} (${node.postposition})`;
    case "possessor":
      return `${describeNode(node.possessed)} de ${describeNode(node.possessor)}`;
    case "modifier":
      return `${describeNode(node.target)} com ${describeNode(node.modifier)}`;
    default:
      return "";
  }
}

function describeDerive(operation: DeriveOperation, child: string, agent?: BuilderNode): string {
  switch (operation) {
    case "agent":
      return `agente de ${child}`;
    case "patient":
      return `paciente de ${child}`;
    case "patient_with_agent":
      return agent ? `paciente de ${child} (agente: ${describeNode(agent)})` : `paciente de ${child}`;
    case "circumstantial":
      return `circunstância de ${child}`;
    case "future":
      return `destinado a ${child}`;
    case "past":
      return `antigo ${child}`;
    case "causative":
      return `fazer ${child}`;
    default:
      return child;
  }
}
