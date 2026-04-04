import { DERIVE_OPERATIONS } from "./builder-types";
import type { BuilderNode } from "./builder-types";

const SAFE_IDENTIFIER_RE = /^[\p{L}_][\p{L}\p{M}0-9_]*$/u;

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
      expr = formatRoot(node.headword);
      break;
    case "compound":
      expr = node.children.map((child) => renderNode(child, true)).join(" + ");
      break;
    case "derive": {
      const token = DERIVE_OPERATIONS[node.operation].token;
      if (node.operation === "patient_with_agent" && node.agent) {
        expr = `${token} * (${renderNode(node.child, true)} * ${renderNode(node.agent, true)})`;
      } else {
        expr = `${token} * ${renderNode(node.child, true)}`;
      }
      break;
    }
    case "postposition":
      expr = `${formatRoot(node.postposition)} * ${renderNode(node.child, true)}`;
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

function formatRoot(value: string): string {
  if (SAFE_IDENTIFIER_RE.test(value)) {
    return value;
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return `Tok("${escaped}")`;
}
