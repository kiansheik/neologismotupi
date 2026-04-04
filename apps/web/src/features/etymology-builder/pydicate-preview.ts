import { DERIVE_OPERATIONS, POSTPOSITION_OPTIONS } from "./builder-types";
import type { BuilderNode, RootNode } from "./builder-types";
import type { RootPosKind } from "./pos";

export function renderPydicate(node: BuilderNode | null): string {
  if (!node) return "";
  return renderNode(node, false);
}

export function collectPieces(node: BuilderNode | null): string[] {
  if (!node) return [];
  switch (node.kind) {
    case "root":
      return [node.headword];
    case "compound":
      return node.children.flatMap((child) => collectPieces(child));
    case "derive": {
      const token = DERIVE_OPERATIONS[node.operation].token;
      return [token, ...collectPieces(node.child), ...(node.agent ? collectPieces(node.agent) : [])];
    }
    case "postposition":
      return [node.postposition, ...collectPieces(node.child)];
    case "possessor":
      return [...collectPieces(node.possessor), ...collectPieces(node.possessed)];
    case "modifier":
      return [...collectPieces(node.modifier), ...collectPieces(node.target)];
    default:
      return [];
  }
}

function renderNode(node: BuilderNode, wrap: boolean): string {
  let expr = "";
  switch (node.kind) {
    case "root":
      expr = formatRoot(node);
      break;
    case "compound":
      expr = node.children.map((child) => renderNode(child, true)).join(" + ");
      break;
    case "derive": {
      const op = DERIVE_OPERATIONS[node.operation];
      const token = op.pydicate ?? op.token;
      if (op.needsAgent && node.agent) {
        expr = `${token} * (${renderNode(node.child, true)} * ${renderNode(node.agent, true)})`;
      } else {
        expr = `${token} * ${renderNode(node.child, true)}`;
      }
      break;
    }
    case "postposition":
      expr = `${formatPostposition(node.postposition)} * ${renderNode(node.child, true)}`;
      break;
    case "possessor":
      expr = `${renderNode(node.possessor, true)} * ${renderNode(node.possessed, true)}`;
      break;
    case "modifier":
      expr = `${renderNode(node.modifier, true)} * ${renderNode(node.target, true)}`;
      break;
    default:
      expr = "";
  }

  if (wrap && needsWrap(expr)) {
    return `(${expr})`;
  }
  return expr;
}

function needsWrap(expr: string): boolean {
  return expr.includes(" + ") || expr.includes(" * ");
}

const POS_CTORS: Record<RootPosKind, string> = {
  noun: "Noun",
  verb_tr: "Verb",
  verb_intr: "Verb",
  verb: "Verb",
  postposition: "Postposition",
  adjective: "Noun",
  adverb: "Adverb",
  pronoun: "Pronoun",
  interjection: "Interjection",
  conjunction: "Conjunction",
  demonstrative: "Demonstrative",
  number: "Number",
  particle: "Particle",
  article: "Particle",
  preposition: "Postposition",
  proper_noun: "ProperNoun",
  copula: "Copula",
  composition: "Composition",
  unknown: "Noun",
};

function formatRoot(node: RootNode): string {
  const ctor = POS_CTORS[node.posKind ?? "unknown"] ?? "Noun";
  const hint = posHint(node);
  return formatCtorCall(ctor, node.headword, hint);
}

function formatInlineRoot(value: string, kind: RootPosKind, hint?: string): string {
  const ctor = POS_CTORS[kind] ?? "Noun";
  return formatCtorCall(ctor, value, hint);
}

const POSTPOSITION_VARIABLES = new Set(POSTPOSITION_OPTIONS.map((option) => option.value));

function formatPostposition(value: string): string {
  if (POSTPOSITION_VARIABLES.has(value)) {
    return value;
  }
  return formatInlineRoot(value, "postposition");
}

function posHint(node: RootNode): string | undefined {
  if (node.rawDefinition) {
    const header = extractDefinitionHeader(node.rawDefinition);
    if (header) return header;
  }
  if (node.posAbbrev) {
    return `(${node.posAbbrev})`;
  }
  return undefined;
}

function extractDefinitionHeader(definition: string): string | undefined {
  const match = definition.trim().match(/^(?:\([^)]*\)\s*){1,4}/);
  if (match && match[0]) {
    return match[0].trim();
  }
  return undefined;
}

function formatCtorCall(ctor: string, value: string, hint?: string): string {
  if (ctor === "Copula" || ctor === "Composition") {
    return `${ctor}()`;
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  if (!hint) return `${ctor}("${escaped}")`;
  const escapedHint = hint.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return `${ctor}("${escaped}", "${escapedHint}")`;
}
