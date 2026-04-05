import { DERIVE_OPERATIONS } from "./builder-types";
import type { PipelineState, RootEntry } from "./builder-types";
import { compactDefinition } from "./pos";

export function renderHumanNote(state: PipelineState): string {
  if (!state.base) return "";

  const segments: string[] = [];
  segments.push(`base: ${describeEntry(state.base)}`);

  if (state.modifiers.length > 0) {
    segments.push(`mod.: ${state.modifiers.map(describeEntryShort).join(" / ")}`);
  }

  if (state.object) {
    if (state.object.mode === "open") {
      segments.push("obj.: em aberto");
    } else if (state.object.entry) {
      segments.push(`obj.: ${describeEntryShort(state.object.entry)}`);
    }
  }

  if (state.derivations.length > 0) {
    const ops = state.derivations.map((derivation) => {
      const op = DERIVE_OPERATIONS[derivation.op];
      const label = `${op.token} (${op.note})`;
      if (op.needsAgent && derivation.agent) {
        return `${label}; agente: ${describeEntryShort(derivation.agent)}`;
      }
      return label;
    });
    segments.push(`deriv.: ${ops.join(", ")}`);
  }

  return segments.join("; ");
}

function describeEntry(entry: RootEntry): string {
  const pos = entry.posAbbrev ? `(${entry.posAbbrev})` : "";
  const gloss = entry.rawDefinition ? compactDefinition(entry.rawDefinition) : entry.gloss ? compactDefinition(entry.gloss) : undefined;
  if (!gloss) return `${entry.headword} ${pos}`.trim();
  return `${entry.headword} ${pos} — ${gloss}`.trim();
}

function describeEntryShort(entry: RootEntry): string {
  return entry.headword;
}
