import { DERIVE_OPERATIONS } from "./builder-types";
import type { BuilderNode, DeriveOperation } from "./builder-types";

export function renderHumanNote(node: BuilderNode | null): string {
  if (!node) return "";
  const roots = collectRoots(node);
  const ops = collectOperations(node);
  const segments: string[] = [];

  if (roots.length > 0) {
    const rootText = roots.map(formatRootBrief).join(" | ");
    segments.push(`raízes: ${rootText}`);
  }

  if (ops.length > 0) {
    segments.push(`operações: ${ops.join(", ")}`);
  }

  const summary = describeNode(node);
  if (summary) {
    segments.push(`resultado: ${summary}`);
  }

  return segments.join("; ");
}

function collectRoots(node: BuilderNode, acc: BuilderNode[] = [], seen: Set<string> = new Set()): BuilderNode[] {
  if (node.kind === "root") {
    if (!seen.has(node.id)) {
      acc.push(node);
      seen.add(node.id);
    }
    return acc;
  }
  switch (node.kind) {
    case "compound":
      node.children.forEach((child) => collectRoots(child, acc, seen));
      break;
    case "derive":
      collectRoots(node.child, acc, seen);
      if (node.agent) collectRoots(node.agent, acc, seen);
      break;
    case "postposition":
      collectRoots(node.child, acc, seen);
      break;
    case "possessor":
      collectRoots(node.possessor, acc, seen);
      collectRoots(node.possessed, acc, seen);
      break;
    case "modifier":
      collectRoots(node.modifier, acc, seen);
      collectRoots(node.target, acc, seen);
      break;
    case "verb_frame":
      collectRoots(node.verb, acc, seen);
      if (node.subject?.value) collectRoots(node.subject.value, acc, seen);
      if (node.object?.value) collectRoots(node.object.value, acc, seen);
      break;
    case "verb_argument":
      if (node.value) collectRoots(node.value, acc, seen);
      break;
    default:
      break;
  }
  return acc;
}

function collectOperations(node: BuilderNode, acc: string[] = []): string[] {
  switch (node.kind) {
    case "derive": {
      const op = DERIVE_OPERATIONS[node.operation];
      acc.push(`${op.token} (${op.note})`);
      collectOperations(node.child, acc);
      if (node.agent) {
        acc.push(`agente: ${describeNode(node.agent)}`);
      }
      break;
    }
    case "postposition":
      acc.push(`posp. ${node.postposition}`);
      collectOperations(node.child, acc);
      break;
    case "possessor":
      acc.push(`possuidor: ${describeNode(node.possessor)}`);
      collectOperations(node.possessed, acc);
      break;
    case "modifier":
      acc.push(`modificador: ${describeNode(node.modifier)}`);
      collectOperations(node.target, acc);
      break;
    case "compound":
      node.children.forEach((child) => collectOperations(child, acc));
      break;
    case "verb_frame":
      collectOperations(node.verb, acc);
      if (node.subject) collectOperations(node.subject, acc);
      if (node.object) collectOperations(node.object, acc);
      break;
    case "verb_argument":
      acc.push(describeVerbArgument(node));
      if (node.value) collectOperations(node.value, acc);
      break;
    default:
      break;
  }
  return acc;
}

function formatRootBrief(node: BuilderNode): string {
  if (node.kind !== "root") return "";
  const gloss = node.gloss?.trim();
  const pos = node.posAbbrev ? `(${node.posAbbrev})` : "";
  if (!gloss) return `${node.headword} ${pos}`.trim();
  const shortGloss = gloss.length > 60 ? `${gloss.slice(0, 57)}...` : gloss;
  return `${node.headword} ${pos} — ${shortGloss}`.trim();
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
    case "verb_frame": {
      const pieces = [`verbo ${describeNode(node.verb)}`];
      if (node.subject) pieces.push(describeVerbArgument(node.subject));
      if (node.object) pieces.push(describeVerbArgument(node.object));
      return pieces.join("; ");
    }
    case "verb_argument":
      return describeVerbArgument(node);
    default:
      return "";
  }
}

function describeVerbArgument(node: Extract<BuilderNode, { kind: "verb_argument" }>): string {
  const roleLabel = node.role === "subject" ? "sujeito" : "objeto";
  if (node.status === "omitted") {
    return `${roleLabel} omitido`;
  }
  if (node.status === "unspecified") {
    return `${roleLabel} a definir`;
  }
  if (node.value) {
    return `${roleLabel}: ${describeNode(node.value)}`;
  }
  return `${roleLabel} explícito`;
}

function describeDerive(operation: DeriveOperation, child: string, agent?: BuilderNode): string {
  const op = DERIVE_OPERATIONS[operation];
  switch (operation) {
    case "agent_sara":
    case "agent_bae":
      return `agente de ${child}`;
    case "patient_pyra":
      return `paciente de ${child}`;
    case "patient_emi":
      return agent ? `paciente de ${child} (agente: ${describeNode(agent)})` : `paciente de ${child}`;
    case "circumstantial_saba":
      return `circunstância de ${child}`;
    case "future_rama":
      return `destinado a ${child}`;
    case "past_puera":
      return `antigo ${child}`;
    case "basic_a":
      return `ação de ${child}`;
    case "deadverbal_nduara":
      return `adjetivo de ${child}`;
    case "causative_mo":
      return `fazer ${child}`;
    case "causative_ero":
      return `fazer ${child} (com companhia/meio)`;
    default:
      return op?.note ? `${op.note} de ${child}` : child;
  }
}
